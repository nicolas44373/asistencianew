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
    const { nombre, apellido, dni, sucursal_id, rol, activo, sueldo, resetDevice, resetPassword, nuevaPassword, permitir_otra_sucursal } = body

    const adminClient = createAdminClient()

    const updateData: Record<string, unknown> = {
      nombre, apellido, sucursal_id, rol, activo,
      sueldo: sueldo !== '' && sueldo != null ? Number(sueldo) : null,
      permitir_otra_sucursal: !!permitir_otra_sucursal,
    }

    if ((rol === 'empleado' || rol === 'administracion') && dni?.trim()) {
      const dniTrim = dni.trim()
      updateData.dni = dniTrim
      const { error: authErr } = await adminClient.auth.admin.updateUserById(params.id, {
        email:        `${dniTrim}@empleado.local`,
        password:     dniTrim,
        app_metadata: { rol },
      })
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
    } else if (rol === 'admin') {
      const authUpdate: Record<string, unknown> = { app_metadata: { rol } }
      if (resetPassword && nuevaPassword) authUpdate.password = nuevaPassword
      const { error: authErr } = await adminClient.auth.admin.updateUserById(params.id, authUpdate)
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
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

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: adminRow } = await supabase
      .from('empleados').select('rol').eq('id', user.id).single()
    if (adminRow?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (user.id === params.id) {
      return NextResponse.json({ error: 'No podés eliminar tu propio usuario' }, { status: 400 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno' },
        { status: 500 }
      )
    }

    const adminClient = createAdminClient()

    await adminClient.from('justificaciones').delete().eq('empleado_id', params.id)
    await adminClient.from('horarios_empleado').delete().eq('empleado_id', params.id)

    const { error: empErr } = await adminClient
      .from('empleados')
      .delete()
      .eq('id', params.id)

    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

    const { error: authErr } = await adminClient.auth.admin.deleteUser(params.id)
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
