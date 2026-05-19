import type { HorarioSucursal } from '@/lib/types/database'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * Calcula los minutos de hora extra generados por una salida tardía.
 *
 * Lógica:
 *   - Si horaSalida < umbral_extra  →  0 min
 *   - Si horaSalida >= umbral_extra →  minutos entre hora_salida y horaSalida
 *
 * El umbral_extra actúa como mínimo de activación (p.ej. 13:30 + 30 min = 14:00).
 * Una vez superado, el extra se cuenta desde hora_salida (no desde umbral_extra).
 *
 * Ejemplo JBJ mañana: hora_salida=13:30, umbral_extra=14:00.
 *   Sale 13:45 → 0 min (no alcanzó el umbral de 30 min).
 *   Sale 14:00 → 30 min (14:00 − 13:30).
 *   Sale 14:15 → 45 min (14:15 − 13:30).
 */
export function calcularExtra(
  horaSalida: Date,
  horario: Pick<HorarioSucursal, 'hora_salida' | 'umbral_extra'>
): number {
  const localSalida = toZonedTime(horaSalida, TZ)

  const buildTime = (horaStr: string): Date => {
    const [hh, mm] = horaStr.split(':').map(Number)
    const t = new Date(localSalida)
    t.setHours(hh, mm, 0, 0)
    return fromZonedTime(t, TZ)
  }

  const umbralUTC    = buildTime(horario.umbral_extra)
  const salidaFin    = buildTime(horario.hora_salida)

  if (horaSalida.getTime() < umbralUTC.getTime()) {
    return 0
  }

  const diffMs = horaSalida.getTime() - salidaFin.getTime()
  return Math.floor(diffMs / 60_000)
}
