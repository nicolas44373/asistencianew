import type { HorarioSucursal } from '@/lib/types/database'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

/**
 * Calcula los minutos de hora extra por llegada anticipada.
 *
 * El umbral real de apertura = hora_entrada + tolerancia_min.
 * Si el empleado llegó ANTES de hora_entrada → extra = umbral_apertura − llegada.
 * Si llegó desde hora_entrada en adelante (a tiempo o tarde) → 0.
 *
 * Ejemplo JBJ mañana: hora_entrada=08:15, tolerancia_min=15 → apertura=08:30.
 *   Llega 08:00 → extra = 08:30 − 08:00 = 30 min.
 *
 * Ejemplo Juramento: hora_entrada=07:00, tolerancia_min=0 → apertura=07:00.
 *   Llega 06:45 → extra = 07:00 − 06:45 = 15 min.
 */
export function calcularExtraEntrada(
  horaEntrada: Date,
  horario: Pick<HorarioSucursal, 'hora_entrada' | 'tolerancia_min'>
): number {
  const localEntrada = toZonedTime(horaEntrada, TZ)

  const buildTime = (horaStr: string, offsetMin: number = 0): Date => {
    const [hh, mm] = horaStr.split(':').map(Number)
    const t = new Date(localEntrada)
    t.setHours(hh, mm + offsetMin, 0, 0)
    return fromZonedTime(t, TZ)
  }

  // Solo genera extra si llegó MÁS de tolerancia_min antes de hora_entrada.
  // Ej. mañana: hora_entrada=08:15, tolerancia=15 → umbral=08:00; llega 08:00 → 30min ✓
  //     tarde:  hora_entrada=16:45, tolerancia=14 → umbral=16:31; llega 16:40 → 0min  ✓
  const umbralTempranoUTC = buildTime(horario.hora_entrada, -horario.tolerancia_min)
  if (horaEntrada.getTime() > umbralTempranoUTC.getTime()) return 0

  const umbralAperturaUTC = buildTime(horario.hora_entrada, horario.tolerancia_min)
  const diffMs = umbralAperturaUTC.getTime() - horaEntrada.getTime()
  return Math.floor(diffMs / 60_000)
}
