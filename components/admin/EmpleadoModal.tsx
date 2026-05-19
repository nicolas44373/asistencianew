'use client'

import { useState, useEffect, useCallback } from 'react'
import { addMonths, subMonths } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { formatHora, formatFecha, formatMinutos, nombreMes } from '@/lib/utils/tiempo'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias } from '@/lib/reglas/calcularInasistencias'
import { format } from 'date-fns-tz'
import type { RegistroAsistencia, HorarioSucursal, Empleado } from '@/lib/types/database'

const TZ = 'America/Argentina/Buenos_Aires'

type EmpleadoFull = Empleado & { sucursales: { nombre: string } | null }

interface ModalData {
  empleado: EmpleadoFull
  registros: RegistroAsistencia[]
  horarios: HorarioSucursal[]
  montoPresentismo: number
}

interface Props {
  empleadoId: string
  onClose: () => void
}

export function EmpleadoModal({ empleadoId, onClose }: Props) {
  const supabase = createClient()
  const [mesDate, setMesDate] = useState(new Date())
  const [data, setData]       = useState<ModalData | null>(null)
  const [loading, setLoading] = useState(true)

  const mes = format(mesDate, 'yyyy-MM', { timeZone: TZ })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [año, mesNum] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const hasta = new Date(año, mesNum, 0).toISOString().split('T')[0]

    const { data: empleado } = await supabase
      .from('empleados').select('*, sucursales(nombre)').eq('id', empleadoId).single()

    if (!empleado) { setLoading(false); return }

    const [{ data: registros }, { data: horarios }, { data: config }] = await Promise.all([
      supabase.from('registros_asistencia').select('*')
        .eq('empleado_id', empleadoId)
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('hora_entrada', { ascending: true }),
      supabase.from('horarios_sucursal').select('*')
        .eq('sucursal_id', empleado.sucursal_id ?? ''),
      supabase.from('config_liquidacion').select('monto_presentismo')
        .lte('vigente_desde', hasta)
        .order('vigente_desde', { ascending: false })
        .limit(1).single(),
    ])

    setData({
      empleado: empleado as EmpleadoFull,
      registros: registros ?? [],
      horarios: (horarios ?? []) as HorarioSucursal[],
      montoPresentismo: config ? Number(config.monto_presentismo) : 0,
    })
    setLoading(false)
  }, [empleadoId, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const inasistencias = data
    ? calcularInasistencias(
        data.registros,
        data.horarios,
        mes,
        new Date(data.empleado.created_at).toLocaleDateString('sv-SE', { timeZone: TZ })
      )
    : 0

  const resumen = data
    ? calcularMes(data.registros, data.empleado.sueldo ?? 0, data.montoPresentismo, inasistencias)
    : null

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
          {loading || !data ? (
            <div className="space-y-1.5">
              <div className="h-6 w-44 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-60 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {data.empleado.nombre} {data.empleado.apellido}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="capitalize">{data.empleado.rol}</span>
                {data.empleado.sucursales && ` · ${data.empleado.sucursales.nombre}`}
                {data.empleado.dni && ` · DNI ${data.empleado.dni}`}
              </p>
              {data.empleado.sueldo != null && (
                <p className="text-sm text-gray-500">
                  Sueldo: {fmt(data.empleado.sueldo)}
                  {' · '}
                  <span className={data.empleado.activo ? 'text-green-600' : 'text-gray-400'}>
                    {data.empleado.activo ? 'Activo' : 'Inactivo'}
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

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !data || !resumen ? (
            <p className="text-center text-gray-400 py-10">No se pudo cargar la información</p>
          ) : (
            <>
              {/* Cards resumen */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Días" value={resumen.diasTrabajados} />
                <StatCard label="Tardanzas" value={resumen.tardanzas} danger={resumen.tardanzas >= 3} />
                <StatCard label="Inasistencias" value={resumen.inasistencias} danger={resumen.inasistencias >= 1} />
                <StatCard label="Hs extra" value={resumen.horasExtraFormato} />
              </div>

              {/* Fila presentismo / total */}
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

              {/* Lista de registros */}
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Registros del mes
              </h3>

              {data.registros.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Sin registros en este período</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.registros.map(r => (
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

function StatCard({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${danger ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
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
