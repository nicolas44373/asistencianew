import type { RegistroAsistencia } from '@/lib/types/database'
import { formatHora, formatMinutos } from '@/lib/utils/tiempo'

interface Props {
  registros: RegistroAsistencia[]
}

const nombreTurno: Record<string, string> = {
  mañana: 'Mañana',
  tarde: 'Tarde',
  unico: 'Único',
}

export function HistorialDia({ registros }: Props) {
  if (registros.length === 0) {
    return (
      <div className="text-center text-blue-200 text-sm py-4">
        Sin registros para hoy
      </div>
    )
  }

  return (
    <div className="space-y-3 w-full max-w-sm mx-auto">
      {registros.map(r => (
        <div key={r.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white font-semibold text-sm">
              Turno {r.turno ? nombreTurno[r.turno] ?? r.turno : '—'}
            </span>
            <div className="flex gap-1 flex-wrap justify-end">
              {r.tarde ? (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  TARDANZA
                </span>
              ) : r.hora_entrada ? (
                <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  A TIEMPO
                </span>
              ) : null}
              {r.egreso_anticipado && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  RETIRO ANTICIPADO
                </span>
              )}
            </div>
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

          {r.minutos_extra > 0 && (
            <div className="mt-2 text-xs text-yellow-300 font-medium">
              + {formatMinutos(r.minutos_extra)} de horas extras
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
