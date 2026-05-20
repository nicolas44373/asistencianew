import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: admin } = await supabase
    .from('empleados').select('rol').eq('id', user.id).single()
  if (admin?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('horarios_sucursal')
    .select('*, sucursales(nombre)')
    .order('sucursal_id')
    .order('es_sabado')
    .order('turno')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ horarios: data ?? [] })
}
