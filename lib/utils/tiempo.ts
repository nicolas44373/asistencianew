import { toZonedTime, fromZonedTime, format } from 'date-fns-tz'
import { parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const TZ = 'America/Argentina/Buenos_Aires'

/** Convierte un timestamp UTC (string o Date) a zona horaria local argentina */
export function toLocalDate(utc: string | Date): Date {
  const d = typeof utc === 'string' ? parseISO(utc) : utc
  return toZonedTime(d, TZ)
}

/** Convierte una fecha local argentina a UTC */
export function toUTC(local: Date): Date {
  return fromZonedTime(local, TZ)
}

/** Formatea un timestamp UTC como hora local "HH:mm" */
export function formatHora(utc: string | Date): string {
  return format(toLocalDate(utc), 'HH:mm', { timeZone: TZ })
}

/** Formatea un timestamp UTC como fecha "dd/MM/yyyy" */
export function formatFecha(utc: string | Date): string {
  return format(toLocalDate(utc), 'dd/MM/yyyy', { timeZone: TZ })
}

/** Formatea un timestamp UTC como "dd/MM/yyyy HH:mm" */
export function formatFechaHora(utc: string | Date): string {
  return format(toLocalDate(utc), 'dd/MM/yyyy HH:mm', { timeZone: TZ })
}

/** Retorna la fecha local actual como string "YYYY-MM-DD" */
export function fechaHoyLocal(): string {
  return format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd', { timeZone: TZ })
}

/** Retorna la fecha local de "ayer" como string "YYYY-MM-DD" */
export function fechaAyerLocal(): string {
  const hoyLocal = toZonedTime(new Date(), TZ)
  const ayerLocal = new Date(hoyLocal)
  ayerLocal.setDate(ayerLocal.getDate() - 1)
  return format(ayerLocal, 'yyyy-MM-dd', { timeZone: TZ })
}

/** Retorna el mes local anterior al actual como string "YYYY-MM" */
export function mesAnteriorLocal(): string {
  const hoyLocal = toZonedTime(new Date(), TZ)
  const mesAnterior = new Date(hoyLocal.getFullYear(), hoyLocal.getMonth() - 1, 1)
  return format(mesAnterior, 'yyyy-MM', { timeZone: TZ })
}

/** Formatea minutos totales como "Xh Ymin" */
export function formatMinutos(minutos: number): string {
  if (minutos === 0) return '0 min'
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

/**
 * Dado el string "HH:MM" de hora_entrada/hora_salida del horario,
 * construye un Date en la zona horaria argentina usando la fecha indicada.
 */
export function horaHorarioADate(horaStr: string, fecha: Date): Date {
  const [hh, mm] = horaStr.split(':').map(Number)
  const localDate = toZonedTime(fecha, TZ)
  localDate.setHours(hh, mm, 0, 0)
  return fromZonedTime(localDate, TZ)
}

/** Nombre del mes en español capitalizado */
export function nombreMes(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? parseISO(fecha) : fecha
  return format(d, 'MMMM yyyy', { locale: es })
}
