export interface PeriodoSucursal {
  sucursalId: string
  fechaDesde: string
  fechaHasta: string | null // null = vigente
}

interface HorarioDia {
  es_sabado: boolean
  turno: string
}

/**
 * Construye un resolver `(fecha) => horarios vigentes ese día`, usando el historial de
 * sucursal del empleado en vez de su sucursal actual. Esto evita evaluar fechas pasadas
 * (ej. antes de un traslado) contra el horario de una sucursal a la que todavía no
 * pertenecía — la causa raíz de inasistencias falsas al reasignar sucursal.
 *
 * Prioridad por fecha:
 *   1. Horario personal del empleado (horarios_empleado) — aplica sin importar la sucursal,
 *      es una excepción explícita del empleado.
 *   2. Horario de la sucursal vigente en esa fecha según el historial.
 *   3. Si el empleado no tiene ningún período en el historial (no migrado todavía / caso
 *      límite), cae a `sucursalIdFallback` (su sucursal actual) para todas las fechas,
 *      preservando el comportamiento anterior en vez de devolver 0 inasistencias en falso.
 */
export function construirResolverHorarios(params: {
  historial: PeriodoSucursal[]
  horariosPersonales: HorarioDia[]
  horariosPorSucursal: Map<string, HorarioDia[]>
  esJuanBJustoPorSucursal: Map<string, boolean>
  sucursalIdFallback: string | null
}): (fecha: string) => HorarioDia[] {
  const { historial, horariosPersonales, horariosPorSucursal, esJuanBJustoPorSucursal, sucursalIdFallback } = params

  const horariosDeSucursal = (sucursalId: string): HorarioDia[] => {
    const raw = horariosPorSucursal.get(sucursalId) ?? []
    return esJuanBJustoPorSucursal.get(sucursalId) ? raw.filter(h => h.turno !== 'unico') : raw
  }

  return (fecha: string): HorarioDia[] => {
    if (horariosPersonales.length > 0) return horariosPersonales

    if (historial.length === 0) {
      return sucursalIdFallback ? horariosDeSucursal(sucursalIdFallback) : []
    }

    const periodo = historial.find(
      p => p.fechaDesde <= fecha && (p.fechaHasta === null || fecha <= p.fechaHasta)
    )
    if (!periodo) return []

    return horariosDeSucursal(periodo.sucursalId)
  }
}
