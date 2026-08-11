import { describe, it, expect } from 'vitest'
import { redondearAlMultiploDe100 } from '@/lib/reglas/redondearMonto'

describe('redondearAlMultiploDe100', () => {
  it('71022.52 → 71000 (más cerca del piso)', () => {
    expect(redondearAlMultiploDe100(71022.52)).toBe(71000)
  })

  it('71089.87 → 71100 (más cerca del techo)', () => {
    expect(redondearAlMultiploDe100(71089.87)).toBe(71100)
  })

  it('71050 (exactamente el punto medio) → redondea hacia arriba (Math.round)', () => {
    expect(redondearAlMultiploDe100(71050)).toBe(71100)
  })

  it('71049.99 → 71000 (un centavo antes del punto medio)', () => {
    expect(redondearAlMultiploDe100(71049.99)).toBe(71000)
  })

  it('71000 (ya es múltiplo de 100) → se mantiene igual', () => {
    expect(redondearAlMultiploDe100(71000)).toBe(71000)
  })

  it('0 → 0', () => {
    expect(redondearAlMultiploDe100(0)).toBe(0)
  })

  it('49.99 → 0 (redondea hacia abajo por debajo de 50)', () => {
    expect(redondearAlMultiploDe100(49.99)).toBe(0)
  })

  it('50 → 100 (punto medio del primer centenar)', () => {
    expect(redondearAlMultiploDe100(50)).toBe(100)
  })

  it('299.40 → 300', () => {
    expect(redondearAlMultiploDe100(299.40)).toBe(300)
  })
})
