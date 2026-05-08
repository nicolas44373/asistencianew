import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface Params { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: adminRow } = await supabase
      .from('empleados').select('rol').eq('id', user.id).single()
    if (adminRow?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { nombre, apellido, dni, sucursal_id, rol, activo, sueldo, resetPassword, nuevaPassword, resetDevice } = body

    const adminClient = createAdminClient()

    const updateData: Record<string, unknown> = {
      nombre, apellido, sucursal_id, rol, activo,
      sueldo: sueldo !== '' && sueldo != null ? Number(sueldo) : null,
    }

    // Si es empleado, actualizar el DNI y el email sintético en Auth
    if (rol === 'empleado' && dni?.trim()) {
      updateData.dni = dni.trim()

      const nuevoEmail = `${dni.trim()}@empleado.local`
      const { error: emailErr } = await adminClient.auth.admin.updateUserById(params.id, {
        email: nuevoEmail,
      })
      if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 })
    }

    const { error: empErr } = await adminClient
      .from('empleados')
      .update(updateData)
      .eq('id', params.id)

    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

    if (resetDevice) {
      updateData.device_id = null
    }

    if (resetPassword && nuevaPassword) {
      const { error: pwdErr } = await adminClient.auth.admin.updateUserById(params.id, {
        password: nuevaPassword,
      })
      if (pwdErr) return NextResponse.json({ error: pwdErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
