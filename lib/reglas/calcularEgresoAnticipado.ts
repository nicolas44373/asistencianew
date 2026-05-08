import type { HorarioSucursal } from '@/lib/types/database'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * Determina si una salida es un egreso anticipado.
 * Retorna true si horaSalida (UTC) es anterior a la hora_salida del horario.
 */
export function calcularEgresoAnticipado(
  horaSalida: Date,
  horario: Pick<HorarioSucursal, 'hora_salida'>
): boolean {
  const localSalida = toZonedTime(horaSalida, TZ)

  const [hh, mm] = horario.hora_salida.split(':').map(Number)
  const salidaProgramadaLocal = new Date(localSalida)
  salidaProgramadaLocal.setHours(hh, mm, 0, 0)

  const salidaProgramadaUTC = fromZonedTime(salidaProgramadaLocal, TZ)

  return horaSalida.getTime() < salidaProgramadaUTC.getTime()
}
