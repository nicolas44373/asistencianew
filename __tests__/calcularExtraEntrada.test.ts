import { describe, it, expect } from 'vitest'
import { calcularExtraEntrada } from '@/lib/reglas/calcularExtraEntrada'
import { calcularExtra } from '@/lib/reglas/calcularExtra'
import { fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'
const DIA = '2024-01-15'

function local(hora: string): Date {
  return fromZonedTime(new Date(`${DIA}T${hora}:00`), TZ)
}

// JBJ mañana: hora_entrada=08:15, tolerancia_min=15 → apertura=08:30
describe('calcularExtraEntrada — Juan B. Justo mañana (entrada 08:15, tolerancia 15 → apertura 08:30)', () => {
  const horario = { hora_entrada: '08:15', tolerancia_min: 15 }

  it('Llega 08:00 → 30 min (08:30 − 08:00)', () => {
    expect(calcularExtraEntrada(local('08:00'), horario)).toBe(30)
  })

  it('Llega 07:45 → 45 min (08:30 − 07:45)', () => {
    expect(calcularExtraEntrada(local('07:45'), horario)).toBe(45)
  })

  it('Llega 08:15 → 0 min (exactamente a tiempo, sin extra)', () => {
    expect(calcularExtraEntrada(local('08:15'), horario)).toBe(0)
  })

  it('Llega 08:20 (tarde) → 0 min', () => {
    expect(calcularExtraEntrada(local('08:20'), horario)).toBe(0)
  })
})

// Juramento: hora_entrada=07:00, tolerancia_min=0 → apertura=07:00
describe('calcularExtraEntrada — Juramento (entrada 07:00, tolerancia 0)', () => {
  const horario = { hora_entrada: '07:00', tolerancia_min: 0 }

  it('Llega 06:45 → 15 min (07:00 − 06:45)', () => {
    expect(calcularExtraEntrada(local('06:45'), horario)).toBe(15)
  })

  it('Llega 06:30 → 30 min (07:00 − 06:30)', () => {
    expect(calcularExtraEntrada(local('06:30'), horario)).toBe(30)
  })

  it('Llega 07:00 → 0 min (exactamente a tiempo)', () => {
    expect(calcularExtraEntrada(local('07:00'), horario)).toBe(0)
  })

  it('Llega 07:10 (tarde) → 0 min', () => {
    expect(calcularExtraEntrada(local('07:10'), horario)).toBe(0)
  })
})

// Escenario completo con valores reales JBJ (umbral_extra = hora_salida + 30 min)
describe('Escenario completo — JBJ mañana (hora_salida 13:30, umbral_extra 14:00)', () => {
  const horario = {
    hora_entrada:   '08:15',
    hora_salida:    '13:30',
    umbral_extra:   '14:00',
    tolerancia_min: 15,
  }

  it('entra 08:00, sale 13:30 → 30 min de extra en total', () => {
    const extraEntrada = calcularExtraEntrada(local('08:00'), horario)
    const extraSalida  = calcularExtra(local('13:30'), horario)
    expect(extraEntrada).toBe(30)
    expect(extraSalida).toBe(0)
    expect(extraEntrada + extraSalida).toBe(30)
  })

  it('entra 08:15, sale 13:30 → 0 min de extra en total', () => {
    const extraEntrada = calcularExtraEntrada(local('08:15'), horario)
    const extraSalida  = calcularExtra(local('13:30'), horario)
    expect(extraEntrada).toBe(0)
    expect(extraSalida).toBe(0)
    expect(extraEntrada + extraSalida).toBe(0)
  })

  it('entra 08:15, sale 13:45 → 0 min (salida tardía sin umbral)', () => {
    const extraSalida = calcularExtra(local('13:45'), horario)
    expect(extraSalida).toBe(0)
  })

  it('entra 08:00, sale 14:00 → 60 min de extra (30 entrada + 30 salida)', () => {
    const extraEntrada = calcularExtraEntrada(local('08:00'), horario)
    const extraSalida  = calcularExtra(local('14:00'), horario)
    expect(extraEntrada).toBe(30)
    expect(extraSalida).toBe(30)
    expect(extraEntrada + extraSalida).toBe(60)
  })
})
