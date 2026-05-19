import { describe, it, expect } from 'vitest'
import { calcularExtra } from '@/lib/reglas/calcularExtra'
import { fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

function local(dateStr: string, hora: string): Date {
  return fromZonedTime(new Date(`${dateStr}T${hora}:00`), TZ)
}

const DIA = '2024-01-15'

// Caso con umbral = hora_salida (sin período de gracia)
describe('calcularExtra — umbral igual a hora_salida (sin período de gracia)', () => {
  const horario = { hora_salida: '13:30', umbral_extra: '13:30' }

  it('Salida 13:20 → 0 min', () => {
    expect(calcularExtra(local(DIA, '13:20'), horario)).toBe(0)
  })

  it('Salida 13:29 → 0 min', () => {
    expect(calcularExtra(local(DIA, '13:29'), horario)).toBe(0)
  })

  it('Salida 13:30 → 0 min (exactamente al fin de turno — no genera extra)', () => {
    expect(calcularExtra(local(DIA, '13:30'), horario)).toBe(0)
  })

  it('Salida 13:31 → 1 min de extra', () => {
    expect(calcularExtra(local(DIA, '13:31'), horario)).toBe(1)
  })

  it('Salida 14:00 → 30 min (14:00 − 13:30)', () => {
    expect(calcularExtra(local(DIA, '14:00'), horario)).toBe(30)
  })

  it('Salida 14:20 → 50 min (14:20 − 13:30)', () => {
    expect(calcularExtra(local(DIA, '14:20'), horario)).toBe(50)
  })
})

// Caso JBJ real: umbral_extra = hora_salida + 30 min (mínimo 30 min para contar)
describe('calcularExtra — JBJ mañana (hora_salida 13:30, umbral_extra 14:00 → mínimo 30 min)', () => {
  const horario = { hora_salida: '13:30', umbral_extra: '14:00' }

  it('Salida 13:30 → 0 min (a tiempo)', () => {
    expect(calcularExtra(local(DIA, '13:30'), horario)).toBe(0)
  })

  it('Salida 13:45 → 0 min (15 min tarde, no alcanza el umbral de 30 min)', () => {
    expect(calcularExtra(local(DIA, '13:45'), horario)).toBe(0)
  })

  it('Salida 13:59 → 0 min (justo antes del umbral)', () => {
    expect(calcularExtra(local(DIA, '13:59'), horario)).toBe(0)
  })

  it('Salida 14:00 → 30 min (alcanzó el umbral: 14:00 − 13:30)', () => {
    expect(calcularExtra(local(DIA, '14:00'), horario)).toBe(30)
  })

  it('Salida 14:15 → 45 min (14:15 − 13:30)', () => {
    expect(calcularExtra(local(DIA, '14:15'), horario)).toBe(45)
  })
})

describe('calcularExtra — Juan B. Justo turno tarde (salida 20:30, umbral 20:30)', () => {
  const horario = { hora_salida: '20:30', umbral_extra: '20:30' }

  it('Salida 20:29 → 0 min (antes del fin de turno)', () => {
    expect(calcularExtra(local(DIA, '20:29'), horario)).toBe(0)
  })

  it('Salida 20:30 → 0 min (exactamente al fin de turno — no genera extra)', () => {
    expect(calcularExtra(local(DIA, '20:30'), horario)).toBe(0)
  })

  it('Salida 20:31 → 1 min de extra', () => {
    expect(calcularExtra(local(DIA, '20:31'), horario)).toBe(1)
  })

  it('Salida 21:00 → 30 min (21:00 − 20:30)', () => {
    expect(calcularExtra(local(DIA, '21:00'), horario)).toBe(30)
  })

  it('Salida 21:30 → 60 min (21:30 − 20:30)', () => {
    expect(calcularExtra(local(DIA, '21:30'), horario)).toBe(60)
  })
})

describe('calcularExtra — Juramento (salida 15:00, umbral 15:00)', () => {
  const horario = { hora_salida: '15:00', umbral_extra: '15:00' }

  it('Salida 14:59 → 0 min (antes del fin de turno)', () => {
    expect(calcularExtra(local(DIA, '14:59'), horario)).toBe(0)
  })

  it('Salida 15:00 → 0 min (exactamente al fin de turno — no genera extra)', () => {
    expect(calcularExtra(local(DIA, '15:00'), horario)).toBe(0)
  })

  it('Salida 15:30 → 30 min (15:30 − 15:00)', () => {
    expect(calcularExtra(local(DIA, '15:30'), horario)).toBe(30)
  })

  it('Salida 16:00 → 60 min (16:00 − 15:00)', () => {
    expect(calcularExtra(local(DIA, '16:00'), horario)).toBe(60)
  })

  it('Salida 17:00 → 120 min (17:00 − 15:00)', () => {
    expect(calcularExtra(local(DIA, '17:00'), horario)).toBe(120)
  })
})
