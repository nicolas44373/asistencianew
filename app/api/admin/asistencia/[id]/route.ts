import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularTarde } from '@/lib/reglas/calcularTarde'
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

  // Obtener rol y sucursal del empleado
  const { data: empleado } = await supabase
    .from('empleados').select('rol, sucursal_id').eq('id', empleado_id).single()

  const [fy, fm, fd] = fecha.split('-').map(Number)
  const diaSemana = new Date(fy, fm - 1, fd).getDay()
  const esSabado  = diaSemana === 6

  // Empleados administracion en días de semana no tienen horario de referencia
  const esLibre = empleado?.rol === 'administracion' && !esSabado

  if (esLibre) {
    const { error } = await supabase
      .from('registros_asistencia')
      .update({
        hora_entrada:      entradaDate?.toISOString() ?? null,
        hora_salida:       salidaDate?.toISOString()  ?? null,
        tarde:             false,
        egreso_anticipado: false,
        minutos_extra:     0,
        editado_por:       user.id,
        motivo_edicion,
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recalcular extra del día completo y reasignar al último bloque cerrado
    await recalcularDiaLibre(supabase, empleado_id, fecha)

    return NextResponse.json({ ok: true })
  }

  // Horario personal tiene prioridad sobre el de la sucursal
  const [{ data: personales }, { data: sucursalHorarios }] = await Promise.all([
    supabase.from('horarios_empleado').select('*')
      .eq('empleado_id', empleado_id)
      .eq('turno', turno)
      .eq('es_sabado', esSabado),
    supabase.from('horarios_sucursal').select('*')
      .eq('sucursal_id', empleado?.sucursal_id)
      .eq('turno', turno)
      .eq('es_sabado', esSabado),
  ])

  const horario = personales?.[0] ?? sucursalHorarios?.[0]

  // Para ediciones manuales del admin, los minutos_extra se ponen en 0.
  // El turno del registro puede no reflejar el horario real del empleado
  // (ej: "mañana" con salida a las 20:30 generaría 8 hs extra incorrectas).
  const tarde            = horario && entradaDate ? calcularTarde(entradaDate, horario)           : false
  const egresoAnticipado = horario && salidaDate  ? calcularEgresoAnticipado(salidaDate, horario) : false

  const { error } = await supabase
    .from('registros_asistencia')
    .update({
      hora_entrada:      entradaDate?.toISOString() ?? null,
      hora_salida:       salidaDate?.toISOString()  ?? null,
      tarde,
      egreso_anticipado: egresoAnticipado,
      minutos_extra:     0,
      editado_por:       user.id,
      motivo_edicion,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalcularDiaLibre(supabase: any, empleadoId: string, fecha: string) {
  const { data: bloques } = await supabase
    .from('registros_asistencia')
    .select('id, hora_entrada, hora_salida')
    .eq('empleado_id', empleadoId)
    .eq('fecha', fecha)
    .order('hora_entrada', { ascending: true })

  if (!bloques || bloques.length === 0) return

  let totalMs = 0
  const cerrados: { id: string }[] = []

  for (const b of bloques) {
    if (b.hora_entrada && b.hora_salida) {
      totalMs += new Date(b.hora_salida).getTime() - new Date(b.hora_entrada).getTime()
      cerrados.push(b)
    }
  }

  const totalMin = Math.floor(totalMs / 60_000)
  const extra    = Math.max(0, totalMin - 480)

  // Poner 0 en todos los cerrados y extra solo en el último
  await Promise.all(
    bloques.map((b: { id: string }) => {
      const esUltimoCerrado = cerrados.length > 0 && b.id === cerrados[cerrados.length - 1].id
      return supabase
        .from('registros_asistencia')
        .update({ minutos_extra: esUltimoCerrado ? extra : 0 })
        .eq('id', b.id)
    })
  )
}
