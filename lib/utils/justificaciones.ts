export type TipoJustificacion = 'regular' | 'feriado' | 'media_jornada'

export interface ParsedJustificacion {
  tipo: TipoJustificacion
  texto: string
}

/**
 * Parses the motive of a justification, extracting its type and actual text.
 * Fits backward compatibility: if there's no prefix, it defaults to 'regular'.
 */
export function parseJustificacionMotivo(motivo: string | null): ParsedJustificacion {
  if (!motivo) return { tipo: 'regular', texto: '' }
  if (motivo.startsWith('TIPO:feriado')) {
    const texto = motivo.replace(/^TIPO:feriado(; MOTIVO:)?/, '').trim()
    return { tipo: 'feriado', texto }
  }
  if (motivo.startsWith('TIPO:media_jornada')) {
    const texto = motivo.replace(/^TIPO:media_jornada(; MOTIVO:)?/, '').trim()
    return { tipo: 'media_jornada', texto }
  }
  if (motivo.startsWith('TIPO:regular')) {
    const texto = motivo.replace(/^TIPO:regular(; MOTIVO:)?/, '').trim()
    return { tipo: 'regular', texto }
  }
  return { tipo: 'regular', texto: motivo }
}

/**
 * Serializes the justification type and optional custom motive into a single string.
 */
export function serializeJustificacionMotivo(tipo: TipoJustificacion, texto: string): string {
  const cleanTexto = (texto ?? '').trim()
  if (tipo === 'regular') {
    return cleanTexto
  }
  return `TIPO:${tipo}${cleanTexto ? `; MOTIVO:${cleanTexto}` : ''}`
}
