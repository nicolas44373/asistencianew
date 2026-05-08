import type { HorarioSucursal } from '@/lib/types/database'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * Determina si un ingreso es tardanza.
 * Retorna true si horaIngreso (UTC) es posterior a la hora_entrada del horario.
 */
export function calcularTarde(
  horaIngreso: Date,
  horario: Pick<HorarioSucursal, 'hora_entrada'>
): boolean {
  // Construimos la hora de entrada del horario usando la fecha local del ingreso
  const localIngreso = toZonedTime(horaIngreso, TZ)

  const [hh, mm] = horario.hora_entrada.split(':').map(Number)
  const entradaLocal = new Date(localIngreso)
  entradaLocal.setHours(hh, mm, 0, 0)

  const entradaUTC = fromZonedTime(entradaLocal, TZ)

  return horaIngreso.getTime() > entradaUTC.getTime()
}
