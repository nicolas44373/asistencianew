import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params { params: { id: string } }

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: emp } = await supabase.from('empleados').select('rol').eq('id', user.id).single()
  return emp?.rol === 'admin' ? user : null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createClient()
  if (!await requireAdmin(supabase)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('horarios_empleado')
    .select('*')
    .eq('empleado_id', params.id)
    .order('es_sabado')
    .order('turno')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ horarios: data ?? [] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createClient()
  if (!await requireAdmin(supabase)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json()
  const { turno, hora_entrada, hora_salida, umbral_extra, tolerancia_min, es_sabado } = body

  if (!turno || !hora_entrada || !hora_salida || !umbral_extra) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('horarios_empleado')
    .insert({
      empleado_id:   params.id,
      turno,
      hora_entrada,
      hora_salida,
      umbral_extra,
      tolerancia_min: tolerancia_min ?? 0,
      es_sabado:      es_sabado ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ horario: data })
}
