import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularTarde } from '@/lib/reglas/calcularTarde'
import { calcularExtra } from '@/lib/reglas/calcularExtra'
import { calcularExtraEntrada } from '@/lib/reglas/calcularExtraEntrada'
import { calcularEgresoAnticipado } from '@/lib/reglas/calcularEgresoAnticipado'
import { fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

interface Params { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: admin } = await supabase
    .from('empleados').select('rol').eq('id', user.id).single()
  if (admin?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { fecha, hora_entrada, hora_salida, motivo_edicion, turno, empleado_id } = body

  if (!motivo_edicion?.trim()) {
    return NextResponse.json({ error: 'Motivo de edición obligatorio' }, { status: 400 })
  }

  // Convertir "HH:MM" a Date UTC usando la fecha del registro
  function horaADate(horaStr: string): Date | null {
    if (!horaStr) return null
    const [hh, mm] = horaStr.split(':').map(Number)
    const localStr = `${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
    return fromZonedTime(new Date(localStr), TZ)
  }

  const entradaDate = horaADate(hora_entrada)
  const salidaDate  = horaADate(hora_salida)

  // Obtener horario del empleado
  const { data: empleado } = await supabase
    .from('empleados').select('sucursal_id').eq('id', empleado_id).single()

  const [fy, fm, fd] = fecha.split('-').map(Number)
  const esSabado = new Date(fy, fm - 1, fd).getDay() === 6

  const { data: horarios } = await supabase
    .from('horarios_sucursal')
    .select('*')
    .eq('sucursal_id', empleado?.sucursal_id)
    .eq('turno', turno)
    .eq('es_sabado', esSabado)

  const horario = horarios?.[0]

  // Recalcular tarde, egreso_anticipado y minutos_extra (entrada temprana + salida tardía)
  const tarde               = horario && entradaDate ? calcularTarde(entradaDate, horario)                   : false
  const minutosExtraEntrada = horario && entradaDate ? calcularExtraEntrada(entradaDate, horario)             : 0
  const minutosExtraSalida  = horario && salidaDate  ? calcularExtra(salidaDate, horario)                    : 0
  const minutosExtra        = minutosExtraEntrada + minutosExtraSalida
  const egresoAnticipado    = horario && salidaDate  ? calcularEgresoAnticipado(salidaDate, horario)         : false

  const { error } = await supabase
    .from('registros_asistencia')
    .update({
      hora_entrada:      entradaDate?.toISOString() ?? null,
      hora_salida:       salidaDate?.toISOString()  ?? null,
      tarde,
      egreso_anticipado: egresoAnticipado,
      minutos_extra:     minutosExtra,
      editado_por:       user.id,
      motivo_edicion,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
