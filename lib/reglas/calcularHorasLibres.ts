import type { RegistroAsistencia } from '@/lib/types/database'

export interface ResumenDiaLibre {
  fecha: string
  registros: RegistroAsistencia[]
  minutosTotal: number
  minutosExtra: number
  estaCompleto: boolean
  enCurso: boolean
}

const META_MINUTOS = 480 // 8 horas

/**
 * Calcula las horas trabajadas en un día para un empleado sin horario fijo.
 * Suma la duración de todos los bloques cerrados (entrada + salida).
 * Extra = max(0, total - 480 min).
 */
export function calcularDiaLibre(registros: RegistroAsistencia[]): Omit<ResumenDiaLibre, 'fecha' | 'registros'> {
  let totalMs = 0
  let enCurso = false

  for (const r of registros) {
    if (r.hora_entrada && r.hora_salida) {
      totalMs += new Date(r.hora_salida).getTime() - new Date(r.hora_entrada).getTime()
    } else if (r.hora_entrada && !r.hora_salida) {
      enCurso = true
    }
  }

  const minutosTotal = Math.floor(totalMs / 60_000)
  const minutosExtra = Math.max(0, minutosTotal - META_MINUTOS)
  const estaCompleto = minutosTotal >= META_MINUTOS

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
      const stats = calcularDiaLibre(regs)
      return { fecha, registros: regs, ...stats }
    })
}

/**
 * Cuenta los días laborales (lunes a viernes) pasados del mes
 * donde el empleado no tiene ningún registro de entrada.
 */
export function calcularInasistenciasLibre(
  registros: RegistroAsistencia[],
  mes: string,           // "YYYY-MM"
  fechaIngreso?: string  // "YYYY-MM-DD"
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

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaStr = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (fechaStr < primerDia) continue
    if (fechaStr >= hoyStr) break

    const diaSemana = new Date(year, month - 1, dia).getDay()
    const esLaboralLibre = diaSemana >= 1 && diaSemana <= 5 // solo lunes a viernes

    if (!esLaboralLibre) continue
    if (fechasConRegistro.has(fechaStr)) continue

    inasistencias++
  }

  return inasistencias
}
