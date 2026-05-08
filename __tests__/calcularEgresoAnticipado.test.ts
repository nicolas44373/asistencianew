import { describe, it, expect } from 'vitest'
import { calcularEgresoAnticipado } from '@/lib/reglas/calcularEgresoAnticipado'
import { fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

function local(dateStr: string, hora: string): Date {
  return fromZonedTime(new Date(`${dateStr}T${hora}:00`), TZ)
}

const DIA = '2024-01-15'

describe('calcularEgresoAnticipado — Juan B. Justo turno mañana (salida 13:30)', () => {
  const horario = { hora_salida: '13:30' }

  it('Salida 13:00 → egreso anticipado', () => {
    expect(calcularEgresoAnticipado(local(DIA, '13:00'), horario)).toBe(true)
  })

  it('Salida 13:29 → egreso anticipado (1 min antes)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '13:29'), horario)).toBe(true)
  })

  it('Salida 13:30 → NO egreso anticipado (exactamente al fin de turno)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '13:30'), horario)).toBe(false)
  })

  it('Salida 13:31 → NO egreso anticipado (hora extra)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '13:31'), horario)).toBe(false)
  })

  it('Salida 14:00 → NO egreso anticipado (hora extra)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '14:00'), horario)).toBe(false)
  })
})

describe('calcularEgresoAnticipado — Juan B. Justo turno tarde (salida 20:30)', () => {
  const horario = { hora_salida: '20:30' }

  it('Salida 20:00 → egreso anticipado', () => {
    expect(calcularEgresoAnticipado(local(DIA, '20:00'), horario)).toBe(true)
  })

  it('Salida 20:29 → egreso anticipado (1 min antes)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '20:29'), horario)).toBe(true)
  })

  it('Salida 20:30 → NO egreso anticipado (exactamente al fin de turno)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '20:30'), horario)).toBe(false)
  })

  it('Salida 21:00 → NO egreso anticipado (hora extra)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '21:00'), horario)).toBe(false)
  })
})

describe('calcularEgresoAnticipado — Juramento (salida 15:00)', () => {
  const horario = { hora_salida: '15:00' }

  it('Salida 14:00 → egreso anticipado', () => {
    expect(calcularEgresoAnticipado(local(DIA, '14:00'), horario)).toBe(true)
  })

  it('Salida 14:59 → egreso anticipado (1 min antes)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '14:59'), horario)).toBe(true)
  })

  it('Salida 15:00 → NO egreso anticipado (exactamente al fin de turno)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '15:00'), horario)).toBe(false)
  })

  it('Salida 15:30 → NO egreso anticipado (hora extra)', () => {
    expect(calcularEgresoAnticipado(local(DIA, '15:30'), horario)).toBe(false)
  })
})
