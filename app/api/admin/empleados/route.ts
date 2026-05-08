import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: admin } = await supabase
      .from('empleados').select('rol').eq('id', user.id).single()
    if (admin?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { nombre, apellido, dni, email, password, sucursal_id, rol, sueldo } = body

    if (!nombre || !apellido || !password || !sucursal_id) {
      return NextResponse.json({ error: 'Campos incompletos' }, { status: 400 })
    }

    const rolFinal = rol ?? 'empleado'

    // Empleados: email sintético basado en DNI. Admins: email real (Gmail).
    let emailAuth: string
    if (rolFinal === 'empleado') {
      if (!dni?.trim()) {
        return NextResponse.json({ error: 'El DNI es obligatorio para empleados' }, { status: 400 })
      }
      emailAuth = `${dni.trim()}@empleado.local`
    } else {
      if (!email?.trim()) {
        return NextResponse.json({ error: 'El email es obligatorio para admins' }, { status: 400 })
      }
      emailAuth = email.trim()
    }

    const adminClient = createAdminClient()

    const { data: newUser, error: authErr } = await adminClient.auth.admin.createUser({
      email: emailAuth,
      password,
      email_confirm: true,
    })

    if (authErr || !newUser.user) {
      return NextResponse.json({ error: authErr?.message ?? 'Error al crear usuario' }, { status: 500 })
    }

    const { error: empErr } = await adminClient
      .from('empleados')
      .insert({
        id:          newUser.user.id,
        nombre,
        apellido,
        dni:         rolFinal === 'empleado' ? dni.trim() : null,
        sucursal_id,
        rol:         rolFinal,
        sueldo:      sueldo ? Number(sueldo) : null,
      })

    if (empErr) {
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: empErr.message }, { status: 500 })
    }

    return NextResponse.json({ id: newUser.user.id }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
