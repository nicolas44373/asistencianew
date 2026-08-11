import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fechaAyerLocal } from '@/lib/utils/tiempo'
import { fromZonedTime } from 'date-fns-tz'
import type { HorarioSucursal } from '@/lib/types/database'

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * Job nocturno: autocompleta la salida de registros que quedaron con entrada
 * pero sin salida marcada durante todo el día, usando el horario general de
 * salida de la sucursal/turno correspondiente (sin calcular horas extra).
 *
 * Se ejecuta vía Vercel Cron (ver vercel.json) poco después de medianoche,
 * procesando el día anterior completo (todos los turnos, incluido sábado,
 * ya cerraron para ese momento).
 *
 * Protegido con CRON_SECRET. Acepta opcionalmente ?fecha=YYYY-MM-DD (con el
 * mismo secreto) para poder probarlo manualmente sobre un día puntual.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const fechaOverride = request.nextUrl.searchParams.get('fecha')
  const fecha = fechaOverride || fechaAyerLocal()

  const supabase = createAdminClient()

  const { data: pendientes, error } = await supabase
    .from('registros_asistencia')
    .select('*, empleados!empleado_id(id, sucursal_id, rol)')
    .eq('fecha', fecha)
    .not('hora_entrada', 'is', null)
    .is('hora_salida', null)
    .eq('salida_autocompletada', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [y, m, d] = fecha.split('-').map(Number)
  const esSabado = new Date(y, m - 1, d).getDay() === 6

  let procesados = 0
  const saltados: Array<{ registro_id: string; motivo: string }> = []

  for (const registro of pendientes ?? []) {
    const empleado = registro.empleados as { id: string; sucursal_id: string | null; rol: string } | null

    // Solo aplica a empleados con horario fijo configurado (rol 'empleado').
    // 'admin' no ficha; 'administracion' usa bloques libres sin horario de referencia.
    if (!empleado || empleado.rol !== 'empleado') {
      saltados.push({ registro_id: registro.id, motivo: 'rol sin horario fijo' })
      continue
    }
    if (!registro.turno || !empleado.sucursal_id) {
      saltados.push({ registro_id: registro.id, motivo: 'sin turno o sucursal asignada' })
      continue
    }

    const [{ data: personal }, { data: sucursal }] = await Promise.all([
      supabase.from('horarios_empleado').select('*')
        .eq('empleado_id', empleado.id)
        .eq('turno', registro.turno)
        .eq('es_sabado', esSabado)
        .maybeSingle(),
      supabase.from('horarios_sucursal').select('*')
        .eq('sucursal_id', empleado.sucursal_id)
        .eq('turno', registro.turno)
        .eq('es_sabado', esSabado)
        .maybeSingle(),
    ])

    const horario = (personal ?? sucursal) as HorarioSucursal | null
    if (!horario) {
      saltados.push({ registro_id: registro.id, motivo: 'sin horario configurado para ese turno' })
      continue
    }

    const [hh, mm] = horario.hora_salida.split(':').map(Number)
    const horaSalidaAsignada = fromZonedTime(
      new Date(`${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`),
      TZ
    )

    const { error: updError } = await supabase
      .from('registros_asistencia')
      .update({
        hora_salida: horaSalidaAsignada.toISOString(),
        minutos_extra: 0,
        egreso_anticipado: false,
        salida_autocompletada: true,
        motivo_edicion: 'Autocompletado: no se registró la salida de este turno; se asignó el horario general de la sucursal.',
      })
      .eq('id', registro.id)

    if (updError) {
      saltados.push({ registro_id: registro.id, motivo: updError.message })
      continue
    }

    await supabase.from('auditoria_autocompletado').insert({
      registro_id: registro.id,
      empleado_id: empleado.id,
      fecha,
      turno: registro.turno,
      sucursal_id: empleado.sucursal_id,
      hora_salida_asignada: horaSalidaAsignada.toISOString(),
    })

    procesados++
  }

  return NextResponse.json({ ok: true, fecha, procesados, saltados })
}
