import type { RegistroAsistencia } from '@/lib/types/database'

export interface ResumenDiaLibre {
  fecha: string
  registros: RegistroAsistencia[]
  minutosTotal: number
  minutosExtra: number
  estaCompleto: boolean
  enCurso: boolean
}

/**
 * Calcula las horas trabajadas en un día para un empleado sin horario fijo.
 * Suma la duración de todos los bloques cerrados (entrada + salida).
 * Extra = max(0, total - meta).
 * Lunes a viernes: meta = 510 min (8:30 hs). Sábado: meta = 330 min.
 */
export function calcularDiaLibre(registros: RegistroAsistencia[], fecha: string): Omit<ResumenDiaLibre, 'fecha' | 'registros'> {
  let totalMs = 0
  let enCurso = false

  for (const r of registros) {
    if (r.hora_entrada && r.hora_salida) {
      totalMs += new Date(r.hora_salida).getTime() - new Date(r.hora_entrada).getTime()
    } else if (r.hora_entrada && !r.hora_salida) {
      enCurso = true
    }
  }

  const [y, m, d] = fecha.split('-').map(Number)
  const isSabado = new Date(y, m - 1, d).getDay() === 6
  const metaMinutos = isSabado ? 330 : 510

  const minutosTotal = Math.floor(totalMs / 60_000)
  const minutosExtra = Math.max(0, minutosTotal - metaMinutos)
  const estaCompleto = minutosTotal >= metaMinutos

  return { minutosTotal, minutosExtra, estaCompleto, enCurso }
}

/**
 * Agrupa los registros del mes por fecha y calcula el resumen de cada día.
 * Devuelve el arreglo ordenado por fecha descendente (más reciente primero).
 */
export function agruparPorDia(registros: RegistroAsistencia[]): ResumenDiaLibre[] {
  const mapaFechas = new Map<string, RegistroAsistencia[]>()

  for (const r of registros) {
    if (!mapaFechas.has(r.fecha)) mapaFechas.set(r.fecha, [])
    mapaFechas.get(r.fecha)!.push(r)
  }

  return Array.from(mapaFechas.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, regs]) => {
      const stats = calcularDiaLibre(regs, fecha)
      return { fecha, registros: regs, ...stats }
    })
}

/**
 * Cuenta los días laborales (lunes a sábado) pasados del mes
 * donde el empleado no tiene ningún registro de entrada,
 * excluyendo feriados/media jornada y sumando inasistencias injustificadas explícitas.
 */
export function calcularInasistenciasLibre(
  registros: RegistroAsistencia[],
  mes: string,                                 // "YYYY-MM"
  fechaIngreso?: string,                       // "YYYY-MM-DD"
  fechasInjustificadasExplicitas: Set<string> = new Set(),
  fechasFeriadoOMediaJornada: Set<string> = new Set()
): number {
  const [year, month] = mes.split('-').map(Number)
  const hoy = new Date()
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  const primerDia = fechaIngreso && fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`

  const fechasConRegistro = new Set(
    registros.filter(r => r.hora_entrada).map(r => r.fecha)
  )

  const diasEnMes = new Date(year, month, 0).getDate()
  let inasistencias = 0
  const fechasProcesadas = new Set<string>()

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaStr = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (fechaStr < primerDia) continue
    if (fechaStr >= hoyStr) break

    const diaSemana = new Date(year, month - 1, dia).getDay()
    const esLaboralLibre = diaSemana >= 1 && diaSemana <= 6 // Lunes a Sábado

    if (!esLaboralLibre) continue
    fechasProcesadas.add(fechaStr)

    // Si es feriado o media jornada, no suma inasistencia
    if (fechasFeriadoOMediaJornada.has(fechaStr)) {
      continue
    }

    // Si está marcada explícitamente como injustificada por el admin
    if (fechasInjustificadasExplicitas.has(fechaStr)) {
      inasistencias += 1.0
      continue
    }

    if (fechasConRegistro.has(fechaStr)) continue

    inasistencias++
  }

  // Añadir marcaciones explícitas para fechas que no hayan entrado en la iteración laboral
  fechasInjustificadasExplicitas.forEach(fecha => {
    if (!fechasProcesadas.has(fecha)) {
      inasistencias += 1.0
    }
  })

  return inasistencias
}

/**
 * Cuenta cuántas de las inasistencias del empleado en el mes
 * están cubiertas por las justificaciones comunes.
 */
export function calcularInasistenciasJustificadasLibre(
  registros: RegistroAsistencia[],
  mes: string,
  fechasJustificadas: Set<string>,
  fechaIngreso?: string,
  fechasFeriadoOMediaJornada: Set<string> = new Set()
): number {
  const [year, month] = mes.split('-').map(Number)
  const hoy = new Date()
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  const primerDia = fechaIngreso && fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`

  const fechasConRegistro = new Set(
    registros.filter(r => r.hora_entrada).map(r => r.fecha)
  )

  const diasEnMes = new Date(year, month, 0).getDate()
  let justificadas = 0

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaStr = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (fechaStr < primerDia) continue
    if (fechaStr >= hoyStr) break

    const diaSemana = new Date(year, month - 1, dia).getDay()
    const esLaboralLibre = diaSemana >= 1 && diaSemana <= 6 // Lunes a Sábado

    if (!esLaboralLibre) continue

    // Si es feriado o media jornada, no cuenta como inasistencia justificada
    if (fechasFeriadoOMediaJornada.has(fechaStr)) {
      continue
    }

    if (fechasJustificadas.has(fechaStr)) {
      // Solo es inasistencia justificada si no asistió
      if (!fechasConRegistro.has(fechaStr)) {
        justificadas++
      }
    }
  }

  return justificadas
}
