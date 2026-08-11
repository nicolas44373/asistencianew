/**
 * Redondeo matemático estándar al múltiplo de 100 más cercano (moneda local, sin decimales).
 *
 * Se aplica únicamente al monto FINAL a pagar/liquidar — nunca a cálculos intermedios
 * (horas, tarifas, montoExtra, presentismo por separado), para no perder precisión ni
 * acumular diferencias.
 *
 * Ejemplos:
 *   71022.52 → 71000  (710.2252 redondea a 710 → × 100)
 *   71089.87 → 71100  (710.8987 redondea a 711 → × 100)
 */
export function redondearAlMultiploDe100(monto: number): number {
  return Math.round(monto / 100) * 100
}
