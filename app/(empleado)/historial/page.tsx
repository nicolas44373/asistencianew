import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatHora } from '@/lib/utils/tiempo'
import { subDays } from 'date-fns'
import { format } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import type { RegistroAsistencia } from '@/lib/types/database'

const TZ = 'America/Argentina/Buenos_Aires'

function formatFechaElegante(fechaStr: string): string {
  try {
    const date = new Date(fechaStr + 'T12:00:00')
    const formatted = format(date, "EEEE d 'de' MMMM", { locale: es })
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  } catch {
    return fechaStr
  }
}

export default async function HistorialPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const desde = format(subDays(new Date(), 30), 'yyyy-MM-dd', { timeZone: TZ })

  const [{ data: empleado }, { data: registros }] = await Promise.all([
    supabase
      .from('empleados')
      .select('rol')
      .eq('id', user.id)
      .single(),
    supabase
      .from('registros_asistencia')
      .select('*')
      .eq('empleado_id', user.id)
      .gte('fecha', desde)
      .order('fecha', { ascending: false })
      .order('hora_entrada', { ascending: true })
  ])

  if (!empleado) redirect('/login')

  const esLibre = empleado.rol === 'administracion'

  const getNombreTurno = (turno: string | null, index: number) => {
    if (esLibre) {
      return `Bloque ${index + 1}`
    }
    if (!turno) return 'Turno único'
    const nombres: Record<string, string> = {
      mañana: 'Turno Mañana',
      tarde: 'Turno Tarde',
      unico: 'Turno Único'
    }
    return nombres[turno.toLowerCase()] || `Turno ${turno}`
  }

  // Agrupar registros por fecha
  const registrosPorFecha: Record<string, RegistroAsistencia[]> = {}
  for (const r of registros ?? []) {
    if (!r.fecha) continue
    if (!registrosPorFecha[r.fecha]) {
      registrosPorFecha[r.fecha] = []
    }
    registrosPorFecha[r.fecha].push(r)
  }

  const fechasOrdenadas = Object.keys(registrosPorFecha).sort((a, b) => b.localeCompare(a))

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-800 via-indigo-900 to-slate-900 pb-12 safe-top safe-bottom">
      {/* Header */}
      <header className="max-w-md mx-auto px-5 pt-6 pb-4 flex items-center justify-between sticky top-0 bg-gradient-to-b from-blue-800 to-blue-800/80 backdrop-blur-md z-10">
        <Link href="/fichar" className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors text-sm font-medium">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-white font-extrabold text-base tracking-wide">Mi Historial</h1>
        <div className="w-14" /> {/* Spacer to center title */}
      </header>

      <main className="max-w-md mx-auto px-4 mt-4">
        <div className="mb-6">
          <p className="text-blue-200 text-xs uppercase tracking-widest font-semibold">Registros Recientes</p>
          <h2 className="text-white text-xl font-black mt-1">Últimos 30 días</h2>
        </div>

        {fechasOrdenadas.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-3xl p-10 text-center backdrop-blur-sm mt-8">
            <svg className="w-12 h-12 text-blue-300 mx-auto opacity-40 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="text-blue-200 text-sm font-medium">No se encontraron asistencias registradas en este período.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {fechasOrdenadas.map(fecha => {
              const regsDelDia = registrosPorFecha[fecha]
              return (
                <div key={fecha} className="bg-white/10 border border-white/10 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
                  {/* Fecha de la cabecera del día */}
                  <div className="bg-white/5 px-4 py-3 border-b border-white/5 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5a2.25 2.25 0 012.25 2.25v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    <span className="text-white text-sm font-semibold tracking-wide">
                      {formatFechaElegante(fecha)}
                    </span>
                  </div>

                  {/* Listado de turnos/bloques del día */}
                  <div className="p-4 space-y-4">
                    {regsDelDia.map((r, idx) => {
                      const tieneSalida = !!r.hora_salida
                      return (
                        <div key={r.id} className="bg-slate-950/20 border border-white/5 rounded-xl p-3.5 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-white text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded">
                              {getNombreTurno(r.turno, idx)}
                            </span>
                            {tieneSalida ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Completado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full uppercase tracking-wide animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                En Curso
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {/* Entrada */}
                            <div className="bg-white/5 border border-white/5 rounded-lg p-2 flex items-center gap-3">
                              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-[10px] text-blue-200 uppercase font-semibold tracking-wider">Entrada</p>
                                <p className="text-white font-mono font-bold text-sm tracking-wide mt-0.5">
                                  {r.hora_entrada ? formatHora(r.hora_entrada) : '—'}
                                </p>
                              </div>
                            </div>

                            {/* Salida */}
                            <div className="bg-white/5 border border-white/5 rounded-lg p-2 flex items-center gap-3">
                              <div className={`p-1.5 rounded-md ${tieneSalida ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-[10px] text-blue-200 uppercase font-semibold tracking-wider">Salida</p>
                                <p className="text-white font-mono font-bold text-sm tracking-wide mt-0.5">
                                  {r.hora_salida ? formatHora(r.hora_salida) : '—'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
