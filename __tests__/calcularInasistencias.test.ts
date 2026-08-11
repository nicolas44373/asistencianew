import { describe, it, expect } from 'vitest'
import { calcularInasistencias, calcularInasistenciasJustificadas } from '@/lib/reglas/calcularInasistencias'
import type { RegistroAsistencia } from '@/lib/types/database'

function mockRegistro(overrides: Partial<RegistroAsistencia>): RegistroAsistencia {
  return {
    id: crypto.randomUUID(),
    empleado_id: 'emp1',
    fecha: '2024-01-15',
    turno: 'mañana',
    hora_entrada: '2024-01-15T08:00:00Z',
    hora_salida:  '2024-01-15T12:00:00Z',
    tarde: false,
    egreso_anticipado: false,
    minutos_extra: 0,
    editado_por: null,
    motivo_edicion: null,
    salida_autocompletada: false,
    created_at: '2024-01-15T08:00:00Z',
    ...overrides,
  }
}

describe('calcularInasistencias — cálculo fraccionado por turnos', () => {
  const horarios = [
    { turno: 'mañana', es_sabado: false },
    { turno: 'tarde', es_sabado: false },
  ] as any[]

  it('asistencia a ambos turnos → 22 inasistencias (por los otros 22 días del mes)', () => {
    const registros = [
      mockRegistro({ fecha: '2024-01-15', turno: 'mañana' }),
      mockRegistro({ fecha: '2024-01-15', turno: 'tarde' }),
    ]
    const inas = calcularInasistencias(registros, horarios, '2024-01')
    expect(inas).toBe(22)
  })

  it('ausente en el turno mañana, presente en turno tarde → 22.5 inasistencias', () => {
    const registros = [
      mockRegistro({ fecha: '2024-01-15', turno: 'tarde' }),
    ]
    const inas = calcularInasistencias(registros, horarios, '2024-01')
    expect(inas).toBe(22.5)
  })

  it('ausente en ambos turnos → 23 inasistencias', () => {
    const registros: RegistroAsistencia[] = []
    const inas = calcularInasistencias(registros, horarios, '2024-01')
    expect(inas).toBe(23) // 23 días laborales totales en el mes
  })

  it('asistencia parcial pero con justificación explícita de inasistencia → cuenta como 23', () => {
    const registros = [
      mockRegistro({ fecha: '2024-01-15', turno: 'tarde' }),
    ]
    const explicitas = new Set(['2024-01-15'])
    const inas = calcularInasistencias(registros, horarios, '2024-01', undefined, explicitas)
    expect(inas).toBe(23)
  })
})

describe('calcularInasistenciasJustificadas — proporcionalidad', () => {
  const horarios = [
    { turno: 'mañana', es_sabado: false },
    { turno: 'tarde', es_sabado: false },
  ] as any[]

  it('ausente en 1 turno, justificada la fecha → 0.5 inasistencias justificadas', () => {
    const registros = [
      mockRegistro({ fecha: '2024-01-15', turno: 'tarde' }),
    ]
    const justificadas = new Set(['2024-01-15'])
    const inasJ = calcularInasistenciasJustificadas(registros, horarios, '2024-01', justificadas)
    expect(inasJ).toBe(0.5)
  })

  it('ausente en 2 turnos, justificada la fecha → 1.0 inasistencias justificadas', () => {
    const registros: RegistroAsistencia[] = []
    const justificadas = new Set(['2024-01-15'])
    const inasJ = calcularInasistenciasJustificadas(registros, horarios, '2024-01', justificadas)
    expect(inasJ).toBe(1.0)
  })
})

describe('calcularInasistencias — justificaciones especiales (feriado / media jornada)', () => {
  const horarios = [
    { turno: 'mañana', es_sabado: false },
    { turno: 'tarde', es_sabado: false },
  ] as any[]

  it('ausente en ambos turnos, pero justificada como feriado → no suma inasistencias', () => {
    const registros: RegistroAsistencia[] = []
    const fferiadoMJ = new Set(['2024-01-15'])
    const inas = calcularInasistencias(registros, horarios, '2024-01', undefined, new Set(), fferiadoMJ)
    // 23 días laborales totales en enero, menos 1 feriado = 22 inasistencias
    expect(inas).toBe(22)
  })

  it('ausente en 1 turno (media jornada), pero justificada como media jornada → no suma inasistencias', () => {
    const registros = [
      mockRegistro({ fecha: '2024-01-15', turno: 'mañana' }),
    ]
    const fferiadoMJ = new Set(['2024-01-15'])
    const inas = calcularInasistencias(registros, horarios, '2024-01', undefined, new Set(), fferiadoMJ)
    expect(inas).toBe(22)
  })
})
