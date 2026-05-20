import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function verificarAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: emp } = await supabase.from('empleados').select('rol').eq('id', user.id).single()
  if (emp?.rol !== 'admin') return { supabase, user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user, error: null }
}

/** Crear o actualizar justificación para un empleado en una fecha */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await verificarAdmin()
  if (error) return error

  const body = await request.json()
  const { empleado_id, fecha, justificada, motivo } = body

  if (!empleado_id || !fecha) {
    return NextResponse.json({ error: 'empleado_id y fecha son obligatorios' }, { status: 400 })
  }

  const { data, error: dbError } = await supabase
    .from('justificaciones')
    .upsert(
      { empleado_id, fecha, justificada: justificada ?? true, motivo: motivo ?? null, creado_por: user!.id },
      { onConflict: 'empleado_id,fecha' }
    )
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true, justificacion: data })
}

/** Eliminar justificación (fecha + empleado_id por query string) */
export async function DELETE(request: NextRequest) {
  const { supabase, error } = await verificarAdmin()
  if (error) return error

  const { searchParams } = request.nextUrl
  const empleado_id = searchParams.get('empleado_id')
  const fecha       = searchParams.get('fecha')

  if (!empleado_id || !fecha) {
    return NextResponse.json({ error: 'empleado_id y fecha son obligatorios' }, { status: 400 })
  }

  const { error: dbError } = await supabase
    .from('justificaciones')
    .delete()
    .eq('empleado_id', empleado_id)
    .eq('fecha', fecha)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
