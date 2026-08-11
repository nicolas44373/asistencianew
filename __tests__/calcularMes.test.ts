import { describe, it, expect } from 'vitest'
import { calcularMes } from '@/lib/reglas/calcularMes'
import type { RegistroAsistencia } from '@/lib/types/database'

// Sueldo de referencia: $270.000 → valor_hora = 270000/180 = $1500
const SUELDO            = 270_000
const MONTO_PRESENTISMO = 30_000
const VALOR_HORA        = SUELDO / 180   // 1500

function registro(overrides: Partial<RegistroAsistencia>): RegistroAsistencia {
  return {
    id: crypto.randomUUID(),
    empleado_id: 'emp1',
    fecha: '2024-01-15',
    turno: 'mañana',
    hora_entrada: '2024-01-15T11:15:00Z',
    hora_salida:  '2024-01-15T16:30:00Z',
    tarde: false,
    egreso_anticipado: false,
    minutos_extra: 0,
    editado_por: null,
    motivo_edicion: null,
    salida_autocompletada: false,
    created_at: '2024-01-15T11:15:00Z',
    ...overrides,
  }
}

describe('calcularMes — sin registros', () => {
  it('retorna todo en cero (excepto presentismo)', () => {
    const r = calcularMes([], SUELDO, MONTO_PRESENTISMO)
    expect(r.diasTrabajados).toBe(0)
    expect(r.tardanzas).toBe(0)
    expect(r.minutosExtraTotal).toBe(0)
    expect(r.montoExtra).toBe(0)
    expect(r.presentismo).toBe(MONTO_PRESENTISMO)
    expect(r.totalLiquidar).toBe(MONTO_PRESENTISMO)
  })
})

describe('calcularMes — presentismo', () => {
  it('0 tardanzas → presentismo completo', () => {
    const r = calcularMes([registro({}), registro({ fecha: '2024-01-16' })], SUELDO, MONTO_PRESENTISMO)
    expect(r.tardanzas).toBe(0)
    expect(r.presentismo).toBe(MONTO_PRESENTISMO)
  })

  it('2 tardanzas → presentismo completo (< 3)', () => {
    const r = calcularMes([
      registro({ tarde: true }),
      registro({ tarde: true,  fecha: '2024-01-16' }),
      registro({ tarde: false, fecha: '2024-01-17' }),
    ], SUELDO, MONTO_PRESENTISMO)
    expect(r.tardanzas).toBe(2)
    expect(r.presentismo).toBe(MONTO_PRESENTISMO)
  })

  it('3 tardanzas → presentismo = 0', () => {
    const r = calcularMes([
      registro({ tarde: true }),
      registro({ tarde: true, fecha: '2024-01-16' }),
      registro({ tarde: true, fecha: '2024-01-17' }),
    ], SUELDO, MONTO_PRESENTISMO)
    expect(r.tardanzas).toBe(3)
    expect(r.presentismo).toBe(0)
  })

  it('5 tardanzas → presentismo = 0', () => {
    const registros = Array.from({ length: 5 }, (_, i) =>
      registro({ tarde: true, fecha: `2024-01-${String(i + 1).padStart(2, '0')}` })
    )
    expect(calcularMes(registros, SUELDO, MONTO_PRESENTISMO).presentismo).toBe(0)
  })
})

describe('calcularMes — horas extras (sueldo/180 = $1500/h)', () => {
  it('60 min extra → 1h → $1500', () => {
    const r = calcularMes([registro({ minutos_extra: 60 })], SUELDO, MONTO_PRESENTISMO)
    expect(r.minutosExtraTotal).toBe(60)
    expect(r.horasExtraFormato).toBe('1h')
    expect(r.montoExtra).toBeCloseTo(VALOR_HORA * 1, 1)
  })

  it('90 min extra → 1h 30min → $2250', () => {
    const r = calcularMes([registro({ minutos_extra: 90 })], SUELDO, MONTO_PRESENTISMO)
    expect(r.horasExtraFormato).toBe('1h 30min')
    expect(r.montoExtra).toBeCloseTo(VALOR_HORA * 1.5, 1)
  })

  it('suma extras de múltiples días → 2h 35min', () => {
    const r = calcularMes([
      registro({ minutos_extra: 30 }),
      registro({ minutos_extra: 50, fecha: '2024-01-16' }),
      registro({ minutos_extra: 75, fecha: '2024-01-17' }),
    ], SUELDO, MONTO_PRESENTISMO)
    expect(r.minutosExtraTotal).toBe(155)
    expect(r.horasExtraFormato).toBe('2h 35min')
  })

  it('totalLiquidar = montoExtra + presentismo', () => {
    // 120 min = 2h → 2 × $1500 = $3000 extra + $30000 presentismo = $33000
    const r = calcularMes([registro({ minutos_extra: 120 })], SUELDO, MONTO_PRESENTISMO)
    expect(r.totalLiquidar).toBeCloseTo(VALOR_HORA * 2 + MONTO_PRESENTISMO, 1)
  })

  it('sueldo diferente cambia el valor hora proporcionalmente', () => {
    // Sueldo $360.000 → $2000/h
    const r = calcularMes([registro({ minutos_extra: 60 })], 360_000, MONTO_PRESENTISMO)
    expect(r.montoExtra).toBeCloseTo(2000, 1)
  })
})

describe('calcularMes — días trabajados', () => {
  it('solo cuenta registros con hora_entrada', () => {
    const r = calcularMes([
      registro({}),
      registro({ hora_entrada: null, fecha: '2024-01-16' }),
    ], SUELDO, MONTO_PRESENTISMO)
    expect(r.diasTrabajados).toBe(1)
  })
})

describe('calcularMes — inasistencias', () => {
  it('0 inasistencias → presentismo completo', () => {
    const r = calcularMes([registro({})], SUELDO, MONTO_PRESENTISMO, 0)
    expect(r.inasistencias).toBe(0)
    expect(r.presentismo).toBe(MONTO_PRESENTISMO)
  })

  it('1 inasistencia → presentismo = 0', () => {
    const r = calcularMes([registro({})], SUELDO, MONTO_PRESENTISMO, 1)
    expect(r.inasistencias).toBe(1)
    expect(r.presentismo).toBe(0)
  })

  it('1 inasistencia y 0 tardanzas → pierde presentismo de todas formas', () => {
    const r = calcularMes([registro({ tarde: false })], SUELDO, MONTO_PRESENTISMO, 1)
    expect(r.presentismo).toBe(0)
    expect(r.totalLiquidar).toBe(r.montoExtra)
  })

  it('0 inasistencias pero 3 tardanzas → pierde presentismo', () => {
    const registros = [
      registro({ tarde: true }),
      registro({ tarde: true, fecha: '2024-01-16' }),
      registro({ tarde: true, fecha: '2024-01-17' }),
    ]
    const r = calcularMes(registros, SUELDO, MONTO_PRESENTISMO, 0)
    expect(r.presentismo).toBe(0)
  })
})
