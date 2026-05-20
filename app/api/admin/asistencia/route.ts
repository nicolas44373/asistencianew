import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularTarde } from '@/lib/reglas/calcularTarde'
import { calcularEgresoAnticipado } from '@/lib/reglas/calcularEgresoAnticipado'
import { fromZonedTime } from 'date-fns-tz'
import type { HorarioSucursal, Turno } from '@/lib/types/database'

const TZ = 'America/Argentina/Buenos_Aires'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: admin } = await supabase
    .from('empleados').select('rol').eq('id', user.id).single()
  if (admin?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { empleado_id, fecha, hora_entrada, hora_salida, motivo_edicion } = body

  if (!motivo_edicion?.trim()) {
    return NextResponse.json({ error: 'El motivo es obligatorio' }, { status: 400 })
  }
  if (!hora_entrada) {
    return NextResponse.json({ error: 'La hora de entrada es obligatoria' }, { status: 400 })
  }

  function horaADate(horaStr: string): Date {
    const [hh, mm] = horaStr.split(':').map(Number)
    const localStr = `${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
    return fromZonedTime(new Date(localStr), TZ)
  }

  const entradaDate = horaADate(hora_entrada)
  const salidaDate  = hora_salida ? horaADate(hora_salida) : null

  // Obtener rol y sucursal del empleado
  const { data: empleado } = await supabase
    .from('empleados').select('rol, sucursal_id').eq('id', empleado_id).single()

  const [fy, fm, fd] = fecha.split('-').map(Number)
  const diaSemana = new Date(fy, fm - 1, fd).getDay()
  const esSabado  = diaSemana === 6

  const esLibre = empleado?.rol === 'administracion' && !esSabado

  let turno: Turno
  let tarde               = false
  let egresoAnticipado    = false
  let minutosExtra        = 0

  // Para registros creados manualmente por el admin, no se calculan horas extras
  // automáticamente. El turno detectado puede no coincidir con el horario real del empleado
  // (ej: entrada a las 8:30 detecta "mañana" pero el empleado trabajó todo el día).
  // El cálculo de extras se resetea a 0 siempre en registros manuales del admin.

  if (esLibre) {
    // Determinar número de bloques existentes para el día
    const { data: bloquesExistentes } = await supabase
      .from('registros_asistencia')
      .select('id, hora_entrada, hora_salida')
      .eq('empleado_id', empleado_id)
      .eq('fecha', fecha)

    const bloques = bloquesExistentes ?? []
    turno = bloques.length === 0 ? 'mañana' : 'tarde'

    if (salidaDate) {
      let totalMs = salidaDate.getTime() - entradaDate.getTime()
      for (const b of bloques) {
        if (b.hora_entrada && b.hora_salida) {
          totalMs += new Date(b.hora_salida).getTime() - new Date(b.hora_entrada).getTime()
        }
      }
      const totalMin = Math.floor(totalMs / 60_000)
      minutosExtra = Math.max(0, totalMin - 480)

      // Resetear extras de bloques previos ya cerrados
      const cerrados = bloques.filter((b: { hora_entrada: string | null; hora_salida: string | null }) => b.hora_entrada && b.hora_salida)
      if (cerrados.length > 0) {
        await Promise.all(
          cerrados.map((b: { id: string }) =>
            supabase.from('registros_asistencia').update({ minutos_extra: 0 }).eq('id', b.id)
          )
        )
      }
    }
  } else {
    // Fusionar horarios: el personal sobreescribe al de sucursal para el mismo turno,
    // pero los turnos sin configuración personal heredan el horario de la sucursal.
    const [{ data: personales }, { data: sucursalHorarios }] = await Promise.all([
      supabase.from('horarios_empleado').select('*').eq('empleado_id', empleado_id).eq('es_sabado', esSabado),
      supabase.from('horarios_sucursal').select('*').eq('sucursal_id', empleado?.sucursal_id ?? '').eq('es_sabado', esSabado),
    ])

    const schedMap = new Map<string, HorarioSucursal>()
    for (const h of (sucursalHorarios ?? []) as HorarioSucursal[]) schedMap.set(h.turno, h)
    for (const h of (personales ?? []) as HorarioSucursal[]) schedMap.set(h.turno, h)
    const horarios = Array.from(schedMap.values())

    // Detectar el turno más apropiado según la hora de entrada
    const horario = detectarHorarioPorHora(entradaDate, horarios) ?? horarios[0]

    if (horario) {
      turno = horario.turno
      tarde = calcularTarde(entradaDate, horario)
      // No se calculan extras: el turno auto-detectado puede no reflejar el horario real
      // del empleado (ej: mañana detecta entrada a las 8:30 pero trabajó hasta las 20:30).
      // minutosExtra queda en 0.
      if (salidaDate) {
        egresoAnticipado = calcularEgresoAnticipado(salidaDate, horario)
      }
    } else {
      turno = 'mañana'
    }
  }

  const { data: nuevo, error } = await supabase
    .from('registros_asistencia')
    .insert({
      empleado_id,
      fecha,
      turno,
      hora_entrada:      entradaDate.toISOString(),
      hora_salida:       salidaDate?.toISOString() ?? null,
      tarde,
      egreso_anticipado: egresoAnticipado,
      minutos_extra:     minutosExtra,
      editado_por:       user.id,
      motivo_edicion,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, registro: nuevo })
}

// Encuentra el horario cuya ventana de fichaje contiene la hora dada
function horaStrAMinutos(horaStr: string): number {
  const [h, m] = horaStr.split(':').map(Number)
  return h * 60 + m
}

function detectarHorarioPorHora(hora: Date, horarios: HorarioSucursal[]): HorarioSucursal | null {
  const localStr = hora.toLocaleTimeString('es-AR', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const ahoraMin = horaStrAMinutos(localStr)

  for (const h of horarios) {
    const inicio = horaStrAMinutos(h.hora_entrada) - 60
    const fin    = horaStrAMinutos(h.umbral_extra)  + 60
    if (ahoraMin >= inicio && ahoraMin <= fin) return h
  }
  return null
}
