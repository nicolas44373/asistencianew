import type { RegistroAsistencia } from '@/lib/types/database'
import { fechaHoyLocal } from '@/lib/utils/tiempo'

/**
 * Itera sobre todos los días laborales de un mes y llama al callback
 * con (fecha, tieneRegistro) para cada día que debía trabajar.
 */
function iterarDiasLaborales(
  registros: RegistroAsistencia[],
  horarios: { es_sabado: boolean }[],
  mes: string,
  fechaIngreso: string | undefined,
  callback: (fecha: string, tieneRegistro: boolean) => void
) {
  if (horarios.length === 0) return

  const tieneHorarioSemana = horarios.some(h => !h.es_sabado)
  const tieneHorarioSabado = horarios.some(h => h.es_sabado)

  const [year, month] = mes.split('-').map(Number)
  const hoyStr = fechaHoyLocal()

  const primerDiaStr = fechaIngreso
    ? (fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`)
    : `${mes}-01`

  const fechasConRegistro = new Set(
    registros.filter(r => r.hora_entrada).map(r => r.fecha)
  )

  const diasEnMes = new Date(year, month, 0).getDate()

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const mm  = String(month).padStart(2, '0')
    const dd  = String(dia).padStart(2, '0')
    const fechaStr = `${year}-${mm}-${dd}`

    if (fechaStr < primerDiaStr) continue
    if (fechaStr >= hoyStr) break

    const diaSemana = new Date(year, month - 1, dia).getDay()

    const esDiaLaboral =
      (diaSemana >= 1 && diaSemana <= 5 && tieneHorarioSemana) ||
      (diaSemana === 6 && tieneHorarioSabado)

    if (!esDiaLaboral) continue

    callback(fechaStr, fechasConRegistro.has(fechaStr))
  }
}

/**
 * Cuenta días laborales donde el empleado no tuvo ningún registro de entrada.
 * Solo considera días estrictamente anteriores a hoy y posteriores o iguales
 * a fechaIngreso (fecha local de alta del empleado, "YYYY-MM-DD").
 */
export function calcularInasistencias(
  registros: RegistroAsistencia[],
  horarios: { es_sabado: boolean }[],
  mes: string,
  fechaIngreso?: string,
  fechasInjustificadasExplicitas: Set<string> = new Set()
): number {
  const fechasAusentes = new Set<string>()

  iterarDiasLaborales(registros, horarios, mes, fechaIngreso, (fecha, tieneRegistro) => {
    if (!tieneRegistro) fechasAusentes.add(fecha)
  })

  // Sumar fechas con marcación explícita de injustificada (incluso con asistencia parcial).
  // El Set evita doble conteo si la fecha ya estaba como ausente total.
  for (const fecha of fechasInjustificadasExplicitas) {
    fechasAusentes.add(fecha)
  }

  return fechasAusentes.size
}

/**
 * Cuenta cuántas de las inasistencias del empleado en el mes
 * están cubiertas por el set de fechas justificadas.
 */
export function calcularInasistenciasJustificadas(
  registros: RegistroAsistencia[],
  horarios: { es_sabado: boolean }[],
  mes: string,
  fechasJustificadas: Set<string>,
  fechaIngreso?: string
): number {
  let justificadas = 0
  iterarDiasLaborales(registros, horarios, mes, fechaIngreso, (fecha, tieneRegistro) => {
    if (!tieneRegistro && fechasJustificadas.has(fecha)) justificadas++
  })
  return justificadas
}
