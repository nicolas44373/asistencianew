'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { addMonths, subMonths } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { formatHora, formatFecha, formatMinutos, nombreMes } from '@/lib/utils/tiempo'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias, calcularInasistenciasJustificadas } from '@/lib/reglas/calcularInasistencias'
import { agruparPorDia, calcularInasistenciasLibre } from '@/lib/reglas/calcularHorasLibres'
import { format } from 'date-fns-tz'
import type { RegistroAsistencia, HorarioSucursal, HorarioEmpleado, Empleado, Justificacion } from '@/lib/types/database'

const TZ = 'America/Argentina/Buenos_Aires'

type EmpleadoFull = Empleado & { sucursales: { nombre: string } | null }

interface EstaticosData {
  empleado: EmpleadoFull
  horarios: HorarioSucursal[]
  horariosPersonales: HorarioEmpleado[]
  montoPresentismo: number
}

interface Props {
  empleadoId: string
  onClose: () => void
}

export function EmpleadoModal({ empleadoId, onClose }: Props) {
  const supabase = createClient()
  const [mesDate, setMesDate] = useState(new Date())

  // Datos estáticos: cargados una sola vez al abrir el modal
  const [estaticos, setEstaticos]             = useState<EstaticosData | null>(null)
  const [loadingEstaticos, setLoadingEstaticos] = useState(true)

  // Registros: se recargan solo cuando cambia el mes
  const [registros, setRegistros]               = useState<RegistroAsistencia[]>([])
  const [justificaciones, setJustificaciones]   = useState<Justificacion[]>([])
  const [loadingRegistros, setLoadingRegistros] = useState(true)

  const mes = format(mesDate, 'yyyy-MM', { timeZone: TZ })

  // ── Cargar datos estáticos (una vez por empleadoId) ───────────
  const fetchEstaticos = useCallback(async () => {
    setLoadingEstaticos(true)
    const { data: empleado } = await supabase
      .from('empleados').select('*, sucursales(nombre)').eq('id', empleadoId).single()

    if (!empleado) { setLoadingEstaticos(false); return }

    const [{ data: horarios }, { data: horariosPersonales }, { data: config }] = await Promise.all([
      supabase.from('horarios_sucursal').select('*').eq('sucursal_id', empleado.sucursal_id ?? ''),
      supabase.from('horarios_empleado').select('*').eq('empleado_id', empleadoId),
      supabase.from('config_liquidacion')
        .select('monto_presentismo')
        .order('vigente_desde', { ascending: false })
        .limit(1).single(),
    ])

    setEstaticos({
      empleado: empleado as EmpleadoFull,
      horarios: (horarios ?? []) as HorarioSucursal[],
      horariosPersonales: (horariosPersonales ?? []) as HorarioEmpleado[],
      montoPresentismo: config ? Number(config.monto_presentismo) : 0,
    })
    setLoadingEstaticos(false)
  }, [empleadoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar registros del mes seleccionado ─────────────────────
  const fetchRegistros = useCallback(async () => {
    setLoadingRegistros(true)
    const [ano, mesNum] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const hasta = new Date(ano, mesNum, 0).toISOString().split('T')[0]

    const [{ data }, { data: justs }] = await Promise.all([
      supabase
        .from('registros_asistencia').select('*')
        .eq('empleado_id', empleadoId)
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('hora_entrada', { ascending: true }),
      supabase
        .from('justificaciones').select('*')
        .eq('empleado_id', empleadoId)
        .gte('fecha', desde).lte('fecha', hasta),
    ])

    setRegistros(data ?? [])
    setJustificaciones((justs ?? []) as Justificacion[])
    setLoadingRegistros(false)
  }, [empleadoId, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchEstaticos() }, [fetchEstaticos])
  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fmt = useCallback((n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n),
  [])

  const esLibre = estaticos?.empleado.rol === 'administracion'

  // ── Cálculos memoizados ───────────────────────────────────────
  const horariosEfectivos = useMemo(() =>
    estaticos
      ? (estaticos.horariosPersonales.length > 0 ? estaticos.horariosPersonales : estaticos.horarios)
      : [],
  [estaticos])

  const fechaIngreso = useMemo(() =>
    estaticos ? new Date(estaticos.empleado.created_at).toLocaleDateString('sv-SE', { timeZone: TZ }) : undefined,
  [estaticos])

  const inasistencias = useMemo(() =>
    !esLibre && estaticos
      ? calcularInasistencias(registros, horariosEfectivos, mes, fechaIngreso)
      : 0,
  [esLibre, estaticos, registros, horariosEfectivos, mes, fechaIngreso])

  const inasistenciasJustificadas = useMemo(() => {
    if (esLibre || !estaticos) return 0
    const fechasJust = new Set(justificaciones.filter(j => j.justificada).map(j => j.fecha))
    return calcularInasistenciasJustificadas(registros, horariosEfectivos, mes, fechasJust, fechaIngreso)
  }, [esLibre, estaticos, registros, horariosEfectivos, mes, fechaIngreso, justificaciones])

  const resumen = useMemo(() =>
    !esLibre && estaticos
      ? calcularMes(registros, estaticos.empleado.sueldo ?? 0, estaticos.montoPresentismo, inasistencias, inasistenciasJustificadas)
      : null,
  [esLibre, estaticos, registros, inasistencias, inasistenciasJustificadas])

  const diasPorFecha = useMemo(() =>
    esLibre ? agruparPorDia(registros) : [],
  [esLibre, registros])

  const inasistenciasLibre = useMemo(() =>
    esLibre ? calcularInasistenciasLibre(registros, mes, fechaIngreso) : 0,
  [esLibre, registros, mes, fechaIngreso])

  const statsLibre = useMemo(() => {
    const diasTrabajados  = diasPorFecha.filter(d => d.registros.some(r => r.hora_entrada)).length
    const diasCompletos   = diasPorFecha.filter(d => d.estaCompleto).length
    const minutosExtra    = diasPorFecha.reduce((acc, d) => acc + d.minutosExtra, 0)
    const valorHora       = (estaticos?.empleado.sueldo ?? 0) / 180
    const montoExtra      = parseFloat(((minutosExtra / 60) * valorHora).toFixed(2))
    return { diasTrabajados, diasCompletos, diasIncompletos: diasTrabajados - diasCompletos, minutosExtra, montoExtra }
  }, [diasPorFecha, estaticos])

  const loading = loadingEstaticos || loadingRegistros

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          {loadingEstaticos || !estaticos ? (
            <div className="space-y-1.5">
              <div className="h-6 w-44 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-60 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {estaticos.empleado.nombre} {estaticos.empleado.apellido}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="capitalize">{estaticos.empleado.rol}</span>
                {estaticos.empleado.sucursales && ` · ${estaticos.empleado.sucursales.nombre}`}
                {estaticos.empleado.dni && ` · DNI ${estaticos.empleado.dni}`}
              </p>
              {estaticos.empleado.sueldo != null && (
                <p className="text-sm text-gray-500">
                  Sueldo: {fmt(estaticos.empleado.sueldo)}
                  {' · '}
                  <span className={estaticos.empleado.activo ? 'text-green-600' : 'text-gray-400'}>
                    {estaticos.empleado.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </p>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="ml-4 shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-4">

          {/* Selector de mes */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <button
              onClick={() => setMesDate(d => subMonths(d, 1))}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm px-2 py-1"
            >
              ← Anterior
            </button>
            <span className="font-semibold text-gray-700 capitalize min-w-[140px] text-center">
              {nombreMes(mesDate)}
            </span>
            <button
              onClick={() => setMesDate(d => addMonths(d, 1))}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm px-2 py-1"
            >
              Siguiente →
            </button>
          </div>

          {loadingEstaticos ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !estaticos ? (
            <p className="text-center text-gray-400 py-10">No se pudo cargar la información</p>
          ) : esLibre ? (
            // ── Vista libre (administracion, lunes-viernes) ──────────
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Días" value={statsLibre.diasTrabajados} />
                <StatCard label="Días completos" value={statsLibre.diasCompletos} />
                <StatCard label="Días < 8 hs" value={statsLibre.diasIncompletos} danger={statsLibre.diasIncompletos > 0} />
                <StatCard label="Hs extra" value={formatMinutos(statsLibre.minutosExtra)} />
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-gray-500">
                  Inasistencias:{' '}
                  <span className={inasistenciasLibre > 0 ? 'text-red-600 font-semibold' : 'text-gray-800 font-semibold'}>
                    {inasistenciasLibre}
                  </span>
                </span>
                <span className="text-gray-500">
                  Extras: <span className="text-gray-800 font-semibold">{fmt(statsLibre.montoExtra)}</span>
                </span>
              </div>

              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Registros del mes
              </h3>

              {loadingRegistros ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : diasPorFecha.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Sin registros en este período</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {diasPorFecha.map(dia => (
                    <div key={dia.fecha} className="py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-500">
                          {formatFecha(dia.fecha + 'T12:00:00')}
                        </span>
                        <div className="flex items-center gap-2">
                          {dia.enCurso ? (
                            <Chip text="En curso" color="blue" />
                          ) : dia.estaCompleto ? (
                            <Chip text={formatMinutos(dia.minutosTotal)} color="green" />
                          ) : (
                            <Chip text={`${formatMinutos(dia.minutosTotal)} / 8h`} color="orange" />
                          )}
                          {dia.minutosExtra > 0 && (
                            <Chip text={`+${formatMinutos(dia.minutosExtra)}`} color="blue" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-1 pl-1">
                        {dia.registros.map((r, i) => (
                          <div key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="text-xs text-gray-400 w-14 shrink-0">Bloque {i + 1}</span>
                            <span className="font-mono">
                              {r.hora_entrada ? formatHora(r.hora_entrada) : '—'}
                              <span className="text-gray-300 mx-1">→</span>
                              {r.hora_salida ? formatHora(r.hora_salida) : <span className="text-gray-300">—</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // ── Vista normal ─────────────────────────────────────────
            <>
              {resumen && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <StatCard label="Días" value={resumen.diasTrabajados} />
                    <StatCard label="Tardanzas" value={resumen.tardanzas} danger={resumen.tardanzas >= 3} />
                    <StatCard
                      label="Inasistencias"
                      value={resumen.inasistencias}
                      sub={resumen.inasistenciasJustificadas > 0 ? `${resumen.inasistenciasJustificadas} justif.` : undefined}
                      danger={resumen.inasistencias - resumen.inasistenciasJustificadas >= 1}
                    />
                    <StatCard label="Hs extra" value={resumen.horasExtraFormato} />
                  </div>

                  <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-gray-500">
                      Presentismo:{' '}
                      <span className={resumen.presentismo === 0 ? 'text-red-600 font-semibold' : 'text-gray-800 font-semibold'}>
                        {fmt(resumen.presentismo)}
                      </span>
                    </span>
                    <span className="text-gray-500">
                      Extras: <span className="text-gray-800 font-semibold">{fmt(resumen.montoExtra)}</span>
                    </span>
                    <span className="ml-auto text-gray-500">
                      Total: <span className="text-gray-900 font-bold text-base">{fmt(resumen.totalLiquidar)}</span>
                    </span>
                  </div>
                </>
              )}

              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Registros del mes
              </h3>

              {loadingRegistros ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : registros.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Sin registros en este período</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {registros.map(r => (
                    <div key={r.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-xs text-gray-400 w-16 shrink-0">
                        {formatFecha(r.fecha + 'T12:00:00')}
                      </span>
                      <span className="text-xs text-gray-400 w-10 shrink-0 capitalize">
                        {r.turno ?? '—'}
                      </span>
                      <span className="font-mono text-sm text-gray-700">
                        {r.hora_entrada ? formatHora(r.hora_entrada) : '—'}
                        <span className="text-gray-300 mx-1">→</span>
                        {r.hora_salida ? formatHora(r.hora_salida) : <span className="text-gray-300">—</span>}
                      </span>
                      <div className="ml-auto flex gap-1 flex-wrap justify-end">
                        {r.tarde && <Chip text="Tardanza" color="red" />}
                        {r.egreso_anticipado && <Chip text="Salida ant." color="orange" />}
                        {r.minutos_extra > 0 && <Chip text={`+${formatMinutos(r.minutos_extra)}`} color="blue" />}
                        {!r.tarde && !r.egreso_anticipado && r.hora_entrada && (
                          <Chip text="A tiempo" color="green" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, danger, sub }: { label: string; value: string | number; danger?: boolean; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${danger ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-xs text-green-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Chip({ text, color }: { text: string; color: 'red' | 'green' | 'blue' | 'orange' }) {
  const cls = {
    red:    'bg-red-100 text-red-700',
    green:  'bg-green-100 text-green-700',
    blue:   'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
  }[color]
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{text}</span>
}
