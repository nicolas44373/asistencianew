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
    const { nombre, apellido, dni, sucursal_id, rol, activo, sueldo, resetDevice, resetPassword, nuevaPassword } = body

    const adminClient = createAdminClient()

    const updateData: Record<string, unknown> = {
      nombre, apellido, sucursal_id, rol, activo,
      sueldo: sueldo !== '' && sueldo != null ? Number(sueldo) : null,
    }

    if (rol === 'empleado' && dni?.trim()) {
      // Empleados: DNI es la credencial → actualizar email sintético y contraseña
      const dniTrim = dni.trim()
      updateData.dni = dniTrim
      const { error: authErr } = await adminClient.auth.admin.updateUserById(params.id, {
        email:    `${dniTrim}@empleado.local`,
        password: dniTrim,
      })
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
    }

    if (rol === 'admin' && resetPassword && nuevaPassword) {
      // Admins: actualizar contraseña manualmente
      const { error: pwdErr } = await adminClient.auth.admin.updateUserById(params.id, {
        password: nuevaPassword,
      })
      if (pwdErr) return NextResponse.json({ error: pwdErr.message }, { status: 500 })
    }

    if (resetDevice) {
      updateData.device_id = null
    }

    const { error: empErr } = await adminClient
      .from('empleados')
      .update(updateData)
      .eq('id', params.id)

    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
