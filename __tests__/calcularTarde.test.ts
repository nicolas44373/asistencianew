import { describe, it, expect } from 'vitest'
import { calcularTarde } from '@/lib/reglas/calcularTarde'
import { fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

function local(dateStr: string, hora: string): Date {
  return fromZonedTime(new Date(`${dateStr}T${hora}:00`), TZ)
}

const DIA = '2024-01-15'

describe('calcularTarde — Juan B. Justo turno mañana (entrada 08:15)', () => {
  const horario = { hora_entrada: '08:15' }

  it('exactamente a las 08:15 → NO tardanza', () => {
    expect(calcularTarde(local(DIA, '08:15'), horario)).toBe(false)
  })

  it('08:10 (5 min antes) → NO tardanza', () => {
    expect(calcularTarde(local(DIA, '08:10'), horario)).toBe(false)
  })

  it('08:16 (1 min después) → tardanza', () => {
    expect(calcularTarde(local(DIA, '08:16'), horario)).toBe(true)
  })

  it('09:00 → tardanza', () => {
    expect(calcularTarde(local(DIA, '09:00'), horario)).toBe(true)
  })
})

describe('calcularTarde — Juan B. Justo turno tarde (entrada 16:45)', () => {
  const horario = { hora_entrada: '16:45' }

  it('16:45 → NO tardanza', () => {
    expect(calcularTarde(local(DIA, '16:45'), horario)).toBe(false)
  })

  it('16:44 → NO tardanza', () => {
    expect(calcularTarde(local(DIA, '16:44'), horario)).toBe(false)
  })

  it('16:46 → tardanza', () => {
    expect(calcularTarde(local(DIA, '16:46'), horario)).toBe(true)
  })
})

describe('calcularTarde — Juramento turno único (entrada 07:00)', () => {
  const horario = { hora_entrada: '07:00' }

  it('07:00 → NO tardanza', () => {
    expect(calcularTarde(local(DIA, '07:00'), horario)).toBe(false)
  })

  it('07:01 → tardanza', () => {
    expect(calcularTarde(local(DIA, '07:01'), horario)).toBe(true)
  })
})
