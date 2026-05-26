export type TipoJustificacion = 'regular' | 'feriado' | 'media_jornada'

export interface ParsedJustificacion {
  tipo: TipoJustificacion
  turno: Turno | 'all'
  texto: string
}

import type { Turno } from '@/lib/types/database'

/**
 * Parses the motive of a justification, extracting its type, turn, and actual text.
 * Fits backward compatibility: if there's no prefix, it defaults to 'regular'.
 */
export function parseJustificacionMotivo(motivo: string | null): ParsedJustificacion {
  if (!motivo) return { tipo: 'regular', turno: 'all', texto: '' }

  let tipo: TipoJustificacion = 'regular'
  let turno: Turno | 'all' = 'all'
  let texto = motivo

  if (motivo.startsWith('TIPO:')) {
    const parts = motivo.split(';').map(p => p.trim())
    for (const part of parts) {
      if (part.startsWith('TIPO:')) {
        tipo = part.substring(5) as TipoJustificacion
      } else if (part.startsWith('TURNO:')) {
        turno = part.substring(6) as Turno | 'all'
      } else if (part.startsWith('MOTIVO:')) {
        texto = part.substring(7)
      }
    }
  } else {
    // Retrocompatibilidad con el formato "TIPO:feriado; MOTIVO:xxx" anterior
    if (motivo.startsWith('TIPO:feriado')) {
      tipo = 'feriado'
      texto = motivo.replace(/^TIPO:feriado(; MOTIVO:)?/, '').trim()
    } else if (motivo.startsWith('TIPO:media_jornada')) {
      tipo = 'media_jornada'
      texto = motivo.replace(/^TIPO:media_jornada(; MOTIVO:)?/, '').trim()
    } else if (motivo.startsWith('TIPO:regular')) {
      tipo = 'regular'
      texto = motivo.replace(/^TIPO:regular(; MOTIVO:)?/, '').trim()
    }
  }

  return { tipo, turno, texto }
}

/**
 * Serializes the justification type, shift/turn, and optional custom motive into a single string.
 */
export function serializeJustificacionMotivo(tipo: TipoJustificacion, texto: string, turno?: Turno | 'all' | null): string {
  const cleanTexto = (texto ?? '').trim()
  const turnoPart = (turno && turno !== 'all') ? `; TURNO:${turno}` : ''
  if (tipo === 'regular') {
    if (turnoPart) {
      return `TIPO:regular${turnoPart}${cleanTexto ? `; MOTIVO:${cleanTexto}` : ''}`
    }
    return cleanTexto
  }
  return `TIPO:${tipo}${turnoPart}${cleanTexto ? `; MOTIVO:${cleanTexto}` : ''}`
}
