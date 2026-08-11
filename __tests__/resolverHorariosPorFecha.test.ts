import { describe, it, expect } from 'vitest'
import { construirResolverHorarios } from '@/lib/reglas/resolverHorariosPorFecha'

const JURAMENTO = 'juramento-id'
const JBJ = 'jbj-id'

const horariosPorSucursal = new Map([
  [JURAMENTO, [{ es_sabado: false, turno: 'unico' }]],
  [JBJ, [{ es_sabado: false, turno: 'mañana' }, { es_sabado: false, turno: 'tarde' }, { es_sabado: false, turno: 'unico' }]],
])
const esJuanBJustoPorSucursal = new Map([[JURAMENTO, false], [JBJ, true]])

describe('construirResolverHorarios — caso real (traslado Juramento → Juan B. Justo)', () => {
  const resolver = construirResolverHorarios({
    historial: [
      { sucursalId: JURAMENTO, fechaDesde: '2026-05-20', fechaHasta: '2026-07-15' },
      { sucursalId: JBJ, fechaDesde: '2026-07-16', fechaHasta: null },
    ],
    horariosPersonales: [],
    horariosPorSucursal,
    esJuanBJustoPorSucursal,
    sucursalIdFallback: JBJ, // sucursal actual del empleado
  })

  it('fecha dentro del período Juramento → turno único (sin mañana/tarde)', () => {
    expect(resolver('2026-07-10')).toEqual([{ es_sabado: false, turno: 'unico' }])
  })

  it('último día del período Juramento (inclusive) → sigue siendo Juramento', () => {
    expect(resolver('2026-07-15')).toEqual([{ es_sabado: false, turno: 'unico' }])
  })

  it('fecha dentro del período Juan B. Justo → mañana/tarde, sin único (JBJ no tiene turno único)', () => {
    expect(resolver('2026-07-20')).toEqual([{ es_sabado: false, turno: 'mañana' }, { es_sabado: false, turno: 'tarde' }])
  })

  it('primer día del período JBJ (inclusive)', () => {
    expect(resolver('2026-07-16')).toEqual([{ es_sabado: false, turno: 'mañana' }, { es_sabado: false, turno: 'tarde' }])
  })

  it('fecha anterior a cualquier período (antes del alta) → sin horario', () => {
    expect(resolver('2026-01-01')).toEqual([])
  })
})

describe('construirResolverHorarios — sin historial (fallback a sucursal actual)', () => {
  it('usa sucursalIdFallback para cualquier fecha', () => {
    const resolver = construirResolverHorarios({
      historial: [],
      horariosPersonales: [],
      horariosPorSucursal,
      esJuanBJustoPorSucursal,
      sucursalIdFallback: JURAMENTO,
    })
    expect(resolver('2020-01-01')).toEqual([{ es_sabado: false, turno: 'unico' }])
    expect(resolver('2030-01-01')).toEqual([{ es_sabado: false, turno: 'unico' }])
  })

  it('sin historial y sin fallback → sin horario', () => {
    const resolver = construirResolverHorarios({
      historial: [],
      horariosPersonales: [],
      horariosPorSucursal,
      esJuanBJustoPorSucursal,
      sucursalIdFallback: null,
    })
    expect(resolver('2026-01-01')).toEqual([])
  })
})

describe('construirResolverHorarios — horario personal tiene prioridad', () => {
  it('ignora el historial de sucursal si hay horario personal configurado', () => {
    const personal = [{ es_sabado: false, turno: 'tarde' }]
    const resolver = construirResolverHorarios({
      historial: [{ sucursalId: JURAMENTO, fechaDesde: '2026-01-01', fechaHasta: null }],
      horariosPersonales: personal,
      horariosPorSucursal,
      esJuanBJustoPorSucursal,
      sucursalIdFallback: JURAMENTO,
    })
    expect(resolver('2026-06-01')).toEqual(personal)
  })
})
