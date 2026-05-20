import { useMemo } from 'react'
import type { RegistroAsistencia } from '@/lib/types/database'
import { formatHora } from '@/lib/utils/tiempo'
import { calcularDiaLibre } from '@/lib/reglas/calcularHorasLibres'

interface Props {
  registros: RegistroAsistencia[]
  esLibre?: boolean
}

export function HistorialDia({ registros, esLibre = false }: Props) {
  // Keep useMemo so calcularDiaLibre isn't recalculated unnecessarily (used only for enCurso check)
  const statsLibre = useMemo(() => calcularDiaLibre(registros), [registros])

  if (registros.length === 0) {
    return (
      <div className="text-center text-blue-200 text-sm py-4">
        Sin registros para hoy
      </div>
    )
  }

  if (esLibre) {
    return (
      <div className="space-y-3 w-full max-w-sm mx-auto">
        {registros.map((r, i) => (
          <div key={r.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-white font-semibold text-sm">Bloque {i + 1}</span>
              {!r.hora_salida && r.hora_entrada && (
                <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  EN CURSO
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-blue-300 text-xs">Entrada</p>
                <p className="text-white font-mono font-semibold">
                  {r.hora_entrada ? formatHora(r.hora_entrada) : '—'}
                </p>
              </div>
              <div>
                <p className="text-blue-300 text-xs">Salida</p>
                <p className="text-white font-mono font-semibold">
                  {r.hora_salida ? formatHora(r.hora_salida) : '—'}
                </p>
              </div>
            </div>
          </div>
        ))}
        {statsLibre.enCurso && (
          <p className="text-center text-blue-300 text-xs">Turno en curso…</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 w-full max-w-sm mx-auto">
      {registros.map(r => (
        <div key={r.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
          <p className="text-white font-semibold text-sm mb-2 capitalize">
            Turno {r.turno ?? '—'}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-blue-300 text-xs">Entrada</p>
              <p className="text-white font-mono font-semibold">
                {r.hora_entrada ? formatHora(r.hora_entrada) : '—'}
              </p>
            </div>
            <div>
              <p className="text-blue-300 text-xs">Salida</p>
              <p className="text-white font-mono font-semibold">
                {r.hora_salida ? formatHora(r.hora_salida) : '—'}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export const nombreTurno: Record<string, string> = { mañana: 'Mañana', tarde: 'Tarde', unico: 'Único' }
export const nombreBloque: Record<string, string> = { mañana: 'Bloque 1', tarde: 'Bloque 2', unico: 'Bloque 1' }
