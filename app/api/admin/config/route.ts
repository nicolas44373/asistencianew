import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fechaHoyLocal } from '@/lib/utils/tiempo'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: admin } = await supabase
    .from('empleados').select('rol').eq('id', user.id).single()
  if (admin?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { monto_presentismo } = await request.json()

  if (typeof monto_presentismo !== 'number') {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }

  // valor_hora_extra se mantiene en la tabla pero ya no se usa — se calcula por empleado
  const { error } = await supabase
    .from('config_liquidacion')
    .insert({
      valor_hora_extra: 0,
      monto_presentismo,
      vigente_desde: fechaHoyLocal(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true }, { status: 201 })
}
