import type { HorarioSucursal, RegistroAsistencia } from '@/lib/types/database'
import { fechaHoyLocal } from '@/lib/utils/tiempo'

/**
 * Cuenta días laborales donde el empleado no tuvo ningún registro de entrada.
 * Solo considera días estrictamente anteriores a hoy y posteriores o iguales
 * a fechaIngreso (fecha local de alta del empleado, "YYYY-MM-DD").
 */
export function calcularInasistencias(
  registros: RegistroAsistencia[],
  horarios: HorarioSucursal[],
  mes: string,        // "YYYY-MM"
  fechaIngreso?: string // "YYYY-MM-DD" — fecha de alta del empleado
): number {
  if (horarios.length === 0) return 0

  const tieneHorarioSemana = horarios.some(h => !h.es_sabado)
  const tieneHorarioSabado = horarios.some(h => h.es_sabado)

  const [year, month] = mes.split('-').map(Number)
  const hoyStr = fechaHoyLocal()

  // Primer día a considerar: el mayor entre el día 1 del mes y la fecha de ingreso
  const primerDiaStr = fechaIngreso
    ? (fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`)
    : `${mes}-01`

  const fechasConRegistro = new Set(
    registros.filter(r => r.hora_entrada).map(r => r.fecha)
  )

  const diasEnMes = new Date(year, month, 0).getDate()
  let inasistencias = 0

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const mm  = String(month).padStart(2, '0')
    const dd  = String(dia).padStart(2, '0')
    const fechaStr = `${year}-${mm}-${dd}`

    if (fechaStr < primerDiaStr) continue // antes del ingreso del empleado
    if (fechaStr >= hoyStr) break         // solo días ya pasados

    const diaSemana = new Date(year, month - 1, dia).getDay() // 0=Dom … 6=Sab

    const esDiaLaboral =
      (diaSemana >= 1 && diaSemana <= 5 && tieneHorarioSemana) ||
      (diaSemana === 6 && tieneHorarioSabado)

    if (!esDiaLaboral) continue
    if (fechasConRegistro.has(fechaStr)) continue

    inasistencias++
  }

  return inasistencias
}
