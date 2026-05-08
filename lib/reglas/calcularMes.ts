import type { RegistroAsistencia, ResumenMensual } from '@/lib/types/database'
import { formatMinutos } from '@/lib/utils/tiempo'

const HORAS_MES = 180

/**
 * Consolida el resumen mensual de un empleado.
 *
 * valor_hora = sueldo / 180
 * monto_extra = (minutos_extra / 60) × valor_hora
 * presentismo = monto_presentismo si tardanzas < 3, sino 0
 */
export function calcularMes(
  registros: RegistroAsistencia[],
  sueldo: number,
  montoPresentismo: number
): ResumenMensual {
  let diasTrabajados = 0
  let tardanzas = 0
  let minutosExtraTotal = 0

  for (const r of registros) {
    if (r.hora_entrada) {
      diasTrabajados++
      if (r.tarde) tardanzas++
      minutosExtraTotal += r.minutos_extra ?? 0
    }
  }

  const valorHora  = sueldo / HORAS_MES
  const horasExtra = minutosExtraTotal / 60
  const montoExtra = parseFloat((horasExtra * valorHora).toFixed(2))

  const presentismo   = tardanzas < 3 ? montoPresentismo : 0
  const totalLiquidar = parseFloat((montoExtra + presentismo).toFixed(2))

  return {
    diasTrabajados,
    tardanzas,
    minutosExtraTotal,
    horasExtraFormato: formatMinutos(minutosExtraTotal),
    montoExtra,
    presentismo,
    totalLiquidar,
  }
}
