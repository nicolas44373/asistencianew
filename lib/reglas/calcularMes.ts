import type { RegistroAsistencia, ResumenMensual } from '@/lib/types/database'
import { formatMinutos } from '@/lib/utils/tiempo'

const HORAS_MES = 180

/**
 * Consolida el resumen mensual de un empleado.
 *
 * valor_hora = sueldo / 180
 * monto_extra = (minutos_extra / 60) × valor_hora
 * presentismo = monto_presentismo si tardanzas < 3 E inasistencias_injustificadas = 0, sino 0
 */
export function calcularMes(
  registros: RegistroAsistencia[],
  sueldo: number,
  montoPresentismo: number,
  inasistencias = 0,
  inasistenciasJustificadas = 0,
  fechasInjustificadasExplicitas: Set<string> = new Set()
): ResumenMensual {
  const fechasConEntrada = new Set<string>()
  let tardanzas = 0
  let minutosExtraTotal = 0

  for (const r of registros) {
    if (r.hora_entrada) {
      fechasConEntrada.add(r.fecha)
      if (r.tarde) tardanzas++
      minutosExtraTotal += r.minutos_extra ?? 0
    }
  }

  const diasTrabajados = fechasConEntrada.size

  const valorHora  = sueldo / HORAS_MES
  const horasExtra = minutosExtraTotal / 60
  const montoExtra = parseFloat((horasExtra * valorHora).toFixed(2))

  const inasistenciasInjustificadas = inasistencias - inasistenciasJustificadas
  const pierdePresntismo = tardanzas >= 3 || inasistenciasInjustificadas >= 1 || fechasInjustificadasExplicitas.size > 0
  const presentismo      = pierdePresntismo ? 0 : montoPresentismo
  const totalLiquidar    = parseFloat((montoExtra + presentismo).toFixed(2))

  return {
    diasTrabajados,
    tardanzas,
    inasistencias,
    inasistenciasJustificadas,
    minutosExtraTotal,
    horasExtraFormato: formatMinutos(minutosExtraTotal),
    montoExtra,
    presentismo,
    totalLiquidar,
  }
}
