import { describe, it, expect } from 'vitest'
import { dentroDeVentanaCierre } from '@/lib/reglas/dentroDeVentanaCierre'
import { fromZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

function local(dateStr: string, hora: string): Date {
  return fromZonedTime(new Date(`${dateStr}T${hora}:00`), TZ)
}

const DIA = '2024-01-15'

// Turno mañana real: entrada 08:00, salida normal 13:30, tolerancia extra hasta 14:30
describe('dentroDeVentanaCierre — turno mañana (umbral_extra 14:30)', () => {
  const horario = { umbral_extra: '14:30' }

  it('13:30 (salida normal) → dentro de la ventana', () => {
    expect(dentroDeVentanaCierre(local(DIA, '13:30'), horario)).toBe(true)
  })

  it('14:00 (dentro de la tolerancia de extra) → dentro de la ventana', () => {
    expect(dentroDeVentanaCierre(local(DIA, '14:00'), horario)).toBe(true)
  })

  it('14:30 (límite exacto de tolerancia) → dentro de la ventana', () => {
    expect(dentroDeVentanaCierre(local(DIA, '14:30'), horario)).toBe(true)
  })

  it('14:31 (un minuto después del límite) → fuera de la ventana', () => {
    expect(dentroDeVentanaCierre(local(DIA, '14:31'), horario)).toBe(false)
  })

  it('16:45 (marca del turno tarde) → fuera de la ventana de la mañana', () => {
    expect(dentroDeVentanaCierre(local(DIA, '16:45'), horario)).toBe(false)
  })
})
