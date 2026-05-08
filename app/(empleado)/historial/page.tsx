import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatHora, formatFecha, formatMinutos } from '@/lib/utils/tiempo'
import { subDays } from 'date-fns'
import { format } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

export default async function HistorialPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const desde = format(subDays(new Date(), 30), 'yyyy-MM-dd', { timeZone: TZ })

  const { data: registros } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('empleado_id', user.id)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .order('hora_entrada', { ascending: true })

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Link href="/fichar" className="text-blue-300 hover:text-white transition-colors">
          ← Volver
        </Link>
        <h1 className="text-white font-bold text-lg">Historial (últimos 30 días)</h1>
      </header>

      {/* Lista */}
      <div className="px-4 pb-10 space-y-3">
        {!registros || registros.length === 0 ? (
          <p className="text-blue-300 text-center py-10">Sin registros en este período</p>
        ) : (
          registros.map(r => (
            <div key={r.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-semibold text-sm">
                    {r.fecha ? formatFecha(r.fecha + 'T00:00:00') : r.fecha}
                  </p>
                  <p className="text-blue-300 text-xs capitalize">{r.turno ?? '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {r.tarde ? (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      TARDANZA
                    </span>
                  ) : r.hora_entrada ? (
                    <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      A TIEMPO
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
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
                <p className="text-yellow-300 text-xs mt-2 font-medium">
                  + {formatMinutos(r.minutos_extra)} horas extras
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
