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
 * Ambos umbrales se construyen usando la fecha local de la salida para
 * manejar correctamente el cambio de día.
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

  const umbralUTC = buildTime(horario.umbral_extra)

  if (horaSalida.getTime() <= umbralUTC.getTime()) {
    return 0
  }

  const diffMs = horaSalida.getTime() - umbralUTC.getTime()
  return Math.floor(diffMs / 60_000)
}
