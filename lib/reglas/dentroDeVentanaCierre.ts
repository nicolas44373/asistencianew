import type { HorarioSucursal } from '@/lib/types/database'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * Determina si "ahora" todavía está dentro de la ventana válida para cerrar
 * (fichar la salida de) un turno: hasta su umbral_extra inclusive
 * (ej. hora_salida 13:30 con umbral_extra 14:30 → válido hasta las 14:30).
 *
 * Pasado ese límite, la marca no puede tratarse como la salida de este turno
 * (lo más probable es que el empleado se haya olvidado de fichar la salida y
 * esté marcando el turno siguiente). Ver `/api/fichar`, que usa este resultado
 * para decidir si cierra el registro abierto o lo deja incompleto.
 */
export function dentroDeVentanaCierre(
  ahora: Date,
  horario: Pick<HorarioSucursal, 'umbral_extra'>
): boolean {
  const localAhora = toZonedTime(ahora, TZ)

  const [hh, mm] = horario.umbral_extra.split(':').map(Number)
  const umbralLocal = new Date(localAhora)
  umbralLocal.setHours(hh, mm, 0, 0)

  const umbralUTC = fromZonedTime(umbralLocal, TZ)

  return ahora.getTime() <= umbralUTC.getTime()
}
