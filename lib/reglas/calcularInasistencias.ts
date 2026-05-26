import type { RegistroAsistencia } from '@/lib/types/database'
import { fechaHoyLocal } from '@/lib/utils/tiempo'

/**
 * Itera sobre todos los días laborales de un mes y llama al callback
 * con (fecha, turnosEsperados, registrosDelDia) para cada día que debía trabajar.
 */
function iterarDiasLaborales(
  registros: RegistroAsistencia[],
  horarios: { es_sabado: boolean; turno: string }[],
  mes: string,
  fechaIngreso: string | undefined,
  callback: (fecha: string, turnosEsperados: string[], registrosDelDia: RegistroAsistencia[]) => void
) {
  if (horarios.length === 0) return

  const tieneHorarioSemana = horarios.some(h => !h.es_sabado)
  const tieneHorarioSabado = horarios.some(h => h.es_sabado)

  const [year, month] = mes.split('-').map(Number)
  const hoyStr = fechaHoyLocal()

  const primerDiaStr = fechaIngreso
    ? (fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`)
    : `${mes}-01`

  const diasEnMes = new Date(year, month, 0).getDate()

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const mm  = String(month).padStart(2, '0')
    const dd  = String(dia).padStart(2, '0')
    const fechaStr = `${year}-${mm}-${dd}`

    if (fechaStr < primerDiaStr) continue
    if (fechaStr >= hoyStr) break

    const diaSemana = new Date(year, month - 1, dia).getDay()

    const esSabado = diaSemana === 6
    const esDiaLaboral =
      (diaSemana >= 1 && diaSemana <= 5 && tieneHorarioSemana) ||
      (esSabado && tieneHorarioSabado)

    if (!esDiaLaboral) continue

    // Turnos esperados para este día
    const turnosEsperados = horarios
      .filter(h => h.es_sabado === esSabado)
      .map(h => h.turno)

    if (turnosEsperados.length === 0) continue

    // Registros que tiene el empleado para esta fecha
    const registrosDelDia = registros.filter(r => r.fecha === fechaStr && r.hora_entrada != null)

    callback(fechaStr, turnosEsperados, registrosDelDia)
  }
}

/**
 * Cuenta días laborales donde el empleado no tuvo registros de entrada para sus turnos.
 * Devuelve un número fraccionado si falta a alguno de los turnos programados (ej. 0.5 si falta a 1 de 2 turnos).
 */
export function calcularInasistencias(
  registros: RegistroAsistencia[],
  horarios: { es_sabado: boolean; turno: string }[],
  mes: string,
  fechaIngreso?: string,
  fechasInjustificadasExplicitas: Set<string> = new Set(),
  fechasFeriadoOMediaJornada: Set<string> = new Set()
): number {
  let totalInasistencias = 0
  const fechasProcesadas = new Set<string>()

  iterarDiasLaborales(registros, horarios, mes, fechaIngreso, (fecha, turnosEsperados, registrosDelDia) => {
    fechasProcesadas.add(fecha)

    // Si es feriado o media jornada para el día completo, no suma inasistencia
    if (fechasFeriadoOMediaJornada.has(fecha)) {
      return
    }

    // Si la fecha está explícitamente marcada como injustificada para todo el día por el admin
    if (fechasInjustificadasExplicitas.has(fecha)) {
      totalInasistencias += 1.0
      return
    }

    const turnosRegistrados = new Set(registrosDelDia.map(r => r.turno as string))
    let dayInasistencias = 0

    for (const t of turnosEsperados) {
      if (!turnosRegistrados.has(t)) {
        // Si este turno específico es feriado o media jornada, no suma inasistencia
        if (fechasFeriadoOMediaJornada.has(`${fecha}_${t}`)) {
          continue
        }
        // Si este turno específico está injustificado
        if (fechasInjustificadasExplicitas.has(`${fecha}_${t}`)) {
          dayInasistencias += 1.0 / turnosEsperados.length
          continue
        }
        dayInasistencias += 1.0 / turnosEsperados.length
      }
    }
    totalInasistencias += dayInasistencias
  })

  // Añadir marcaciones explícitas para fechas que no hayan entrado en la iteración laboral
  fechasInjustificadasExplicitas.forEach(key => {
    const fecha = key.split('_')[0]
    if (!fechasProcesadas.has(fecha)) {
      totalInasistencias += 1.0
    }
  })

  return Math.round(totalInasistencias * 100) / 100
}

/**
 * Cuenta cuántas de las inasistencias del empleado en el mes
 * están cubiertas por el set de fechas justificadas (de forma proporcional si es ausencia parcial).
 */
export function calcularInasistenciasJustificadas(
  registros: RegistroAsistencia[],
  horarios: { es_sabado: boolean; turno: string }[],
  mes: string,
  fechasJustificadas: Set<string>,
  fechaIngreso?: string,
  fechasFeriadoOMediaJornada: Set<string> = new Set()
): number {
  let totalJustificadas = 0

  iterarDiasLaborales(registros, horarios, mes, fechaIngreso, (fecha, turnosEsperados, registrosDelDia) => {
    // Si es feriado o media jornada para el día completo, no cuenta como inasistencia
    if (fechasFeriadoOMediaJornada.has(fecha)) {
      return
    }

    const turnosRegistrados = new Set(registrosDelDia.map(r => r.turno as string))
    let dayJustificadas = 0

    for (const t of turnosEsperados) {
      if (!turnosRegistrados.has(t)) {
        // Si este turno específico es feriado o media jornada, se salta
        if (fechasFeriadoOMediaJornada.has(`${fecha}_${t}`)) {
          continue
        }

        // Si el día completo o este turno específico está justificado
        if (fechasJustificadas.has(fecha) || fechasJustificadas.has(`${fecha}_${t}`)) {
          dayJustificadas += 1.0 / turnosEsperados.length
        }
      }
    }
    totalJustificadas += dayJustificadas
  })

  return Math.round(totalJustificadas * 100) / 100
}

