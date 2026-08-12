import { describe, it, expect } from 'vitest'
import { calcularDiaLibre, calcularInasistenciasLibre } from '@/lib/reglas/calcularHorasLibres'
import type { RegistroAsistencia } from '@/lib/types/database'

describe('calcularDiaLibre', () => {
  it('calcula correctamente la meta de 8:30hs (510 min) de lunes a viernes', () => {
    const registros: RegistroAsistencia[] = [
      {
        id: '1',
        empleado_id: 'emp1',
        fecha: '2026-08-10', // Lunes
        turno: 'mañana',
        hora_entrada: '2026-08-10T08:00:00Z',
        hora_salida: '2026-08-10T16:30:00Z', // 8 horas y 30 min = 510 min
        tarde: false,
        egreso_anticipado: false,
        minutos_extra: 0,
        editado_por: null,
        motivo_edicion: null,
        salida_autocompletada: false,
        created_at: '2026-08-10T08:00:00Z',
      },
    ]

    const result = calcularDiaLibre(registros, '2026-08-10')
    expect(result.minutosTotal).toBe(510)
    expect(result.estaCompleto).toBe(true)
    expect(result.minutosExtra).toBe(0)
  })

  it('calcula horas extra cuando supera las 8:30hs (510 min)', () => {
    const registros: RegistroAsistencia[] = [
      {
        id: '1',
        empleado_id: 'emp1',
        fecha: '2026-08-10', // Lunes
        turno: 'mañana',
        hora_entrada: '2026-08-10T08:00:00Z',
        hora_salida: '2026-08-10T17:30:00Z', // 9 horas y 30 min = 570 min
        tarde: false,
        egreso_anticipado: false,
        minutos_extra: 0,
        editado_por: null,
        motivo_edicion: null,
        salida_autocompletada: false,
        created_at: '2026-08-10T08:00:00Z',
      },
    ]

    const result = calcularDiaLibre(registros, '2026-08-10')
    expect(result.minutosTotal).toBe(570)
    expect(result.estaCompleto).toBe(true)
    expect(result.minutosExtra).toBe(60) // 570 - 510 = 60 min extra
  })

  it('marca día incompleto si trabaja menos de 8:30hs', () => {
    const registros: RegistroAsistencia[] = [
      {
        id: '1',
        empleado_id: 'emp1',
        fecha: '2026-08-10', // Lunes
        turno: 'mañana',
        hora_entrada: '2026-08-10T08:00:00Z',
        hora_salida: '2026-08-10T16:00:00Z', // 8 horas = 480 min
        tarde: false,
        egreso_anticipado: false,
        minutos_extra: 0,
        editado_por: null,
        motivo_edicion: null,
        salida_autocompletada: false,
        created_at: '2026-08-10T08:00:00Z',
      },
    ]

    const result = calcularDiaLibre(registros, '2026-08-10')
    expect(result.minutosTotal).toBe(480)
    expect(result.estaCompleto).toBe(false)
    expect(result.minutosExtra).toBe(0)
  })
})
