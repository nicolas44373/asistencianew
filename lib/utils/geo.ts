const RADIO_TIERRA_M = 6_371_000

/**
 * Distancia en metros entre dos coordenadas GPS usando la fórmula Haversine.
 */
export function distanciaMetros(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2

  return RADIO_TIERRA_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
