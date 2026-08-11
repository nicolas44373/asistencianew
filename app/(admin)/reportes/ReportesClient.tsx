'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Empleado, RegistroAsistencia, ConfigLiquidacion, Sucursal, HorarioSucursal, HorarioEmpleado } from '@/lib/types/database'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias, calcularInasistenciasJustificadas } from '@/lib/reglas/calcularInasistencias'
import { calcularInasistenciasLibre, calcularInasistenciasJustificadasLibre } from '@/lib/reglas/calcularHorasLibres'
import { construirResolverHorarios, type PeriodoSucursal } from '@/lib/reglas/resolverHorariosPorFecha'
import { EmpleadoModal } from '@/components/admin/EmpleadoModal'
import { parseJustificacionMotivo } from '@/lib/utils/justificaciones'
import { nombreMes, formatFecha } from '@/lib/utils/tiempo'

type EmpleadoRow = Empleado & { sucursales: { nombre: string } | null }

interface JustificacionRow {
  empleado_id: string
  fecha: string
  justificada: boolean
  motivo: string | null
}

interface ResumenEmpleadoSnapshot {
  empleadoId: string
  totalLiquidar: number
}

interface CierreAutomatico {
  periodo: string
  fecha_desde: string
  fecha_hasta: string
  generado_en: string
  datos: ResumenEmpleadoSnapshot[]
}

interface Props {
  empleados: EmpleadoRow[]
  registros: RegistroAsistencia[]
  config: ConfigLiquidacion | null
  sucursales: Sucursal[]
  horarios: HorarioSucursal[]
  horariosPersonales: HorarioEmpleado[]
  justificaciones: JustificacionRow[]
  mesActual: string
  sucursalFiltro: string
  empleadoFiltro: string
  todosEmpleados: Array<{ id: string; nombre: string; apellido: string }>
  cierresAutomaticos: CierreAutomatico[]
  historialSucursal: Array<{ empleado_id: string; sucursal_id: string; fecha_desde: string; fecha_hasta: string | null }>
}

export function ReportesClient({
  empleados, registros, config, sucursales, horarios, horariosPersonales, justificaciones, mesActual, sucursalFiltro, empleadoFiltro, todosEmpleados, cierresAutomaticos, historialSucursal,
}: Props) {
  const router = useRouter()
  const [mes, setMes]           = useState(mesActual)
  const [sucursal, setSucursal] = useState(sucursalFiltro)
  const [empleadoId, setEmpleadoId] = useState(empleadoFiltro)
  const [exportando, setExportando] = useState(false)
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null)

  const montoPresentismo = config ? Number(config.monto_presentismo) : 0

  const resúmenes = useMemo(() => {
    const horariosPorSucursal = new Map<string, HorarioSucursal[]>()
    for (const h of horarios) {
      if (!horariosPorSucursal.has(h.sucursal_id)) horariosPorSucursal.set(h.sucursal_id, [])
      horariosPorSucursal.get(h.sucursal_id)!.push(h)
    }

    const horariosPersonalesPorEmpleado = new Map<string, HorarioEmpleado[]>()
    for (const h of horariosPersonales) {
      if (!horariosPersonalesPorEmpleado.has(h.empleado_id)) horariosPersonalesPorEmpleado.set(h.empleado_id, [])
      horariosPersonalesPorEmpleado.get(h.empleado_id)!.push(h)
    }

    const esJuanBJustoPorSucursal = new Map<string, boolean>()
    for (const s of sucursales) {
      esJuanBJustoPorSucursal.set(s.id, s.nombre.toLowerCase().includes('juan b'))
    }

    const historialPorEmpleado = new Map<string, PeriodoSucursal[]>()
    for (const h of historialSucursal) {
      if (!historialPorEmpleado.has(h.empleado_id)) historialPorEmpleado.set(h.empleado_id, [])
      historialPorEmpleado.get(h.empleado_id)!.push({ sucursalId: h.sucursal_id, fechaDesde: h.fecha_desde, fechaHasta: h.fecha_hasta })
    }

    return empleados.map(emp => {
      const regsEmp          = registros.filter(r => r.empleado_id === emp.id)
      const sueldo           = emp.sueldo ?? 0
      const personales       = horariosPersonalesPorEmpleado.get(emp.id) ?? []
      // Resuelve el horario vigente por fecha usando el historial de sucursal del empleado,
      // en vez de asumir su sucursal actual para todo el mes (evita inasistencias falsas tras un traslado).
      const horariosEmp = construirResolverHorarios({
        historial: historialPorEmpleado.get(emp.id) ?? [],
        horariosPersonales: personales,
        horariosPorSucursal,
        esJuanBJustoPorSucursal,
        sucursalIdFallback: emp.sucursal_id,
      })
      const fechaIngreso     = new Date(emp.created_at).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
      const justifiedRows = justificaciones.filter(j => j.empleado_id === emp.id && j.justificada)
      const fechasFeriadoOMediaJornada = new Set<string>()
      const fechasJust = new Set<string>()
      justifiedRows.forEach(j => {
        const parsed = parseJustificacionMotivo(j.motivo)
        const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
        if (parsed.tipo === 'feriado' || parsed.tipo === 'media_jornada') {
          fechasFeriadoOMediaJornada.add(key)
        } else {
          fechasJust.add(key)
        }
      })
      const fechasInjust = new Set<string>()
      justificaciones.filter(j => j.empleado_id === emp.id && !j.justificada).forEach(j => {
        const parsed = parseJustificacionMotivo(j.motivo)
        const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
        fechasInjust.add(key)
      })
      const isLibre          = emp.rol === 'administracion'
      const inasistencias    = isLibre
        ? calcularInasistenciasLibre(regsEmp, mes, fechaIngreso, fechasInjust, fechasFeriadoOMediaJornada)
        : calcularInasistencias(regsEmp, horariosEmp, mes, fechaIngreso, fechasInjust, fechasFeriadoOMediaJornada)
      const inasistJust      = isLibre
        ? calcularInasistenciasJustificadasLibre(regsEmp, mes, fechasJust, fechaIngreso, fechasFeriadoOMediaJornada)
        : calcularInasistenciasJustificadas(regsEmp, horariosEmp, mes, fechasJust, fechaIngreso, fechasFeriadoOMediaJornada)
      const resumen          = calcularMes(regsEmp, sueldo, montoPresentismo, inasistencias, inasistJust, fechasInjust)
      return { empleado: emp, resumen }
    })
  }, [empleados, registros, montoPresentismo, horarios, horariosPersonales, justificaciones, mes, sucursales, historialSucursal])

  function buscar() {
    const params = new URLSearchParams({ mes })
    if (sucursal) params.set('sucursal_id', sucursal)
    if (empleadoId) params.set('empleado_id', empleadoId)
    router.push(`/reportes?${params}`)
  }

  function limpiarFiltros() {
    setSucursal('')
    setEmpleadoId('')
    router.push(`/reportes?mes=${mes}`)
  }

  async function exportarExcel() {
    setExportando(true)
    try {
      const params = new URLSearchParams({ mes })
      if (sucursal) params.set('sucursal_id', sucursal)
      if (empleadoId) params.set('empleado_id', empleadoId)
      const res = await fetch(`/api/admin/reportes/excel?${params}`)
      if (!res.ok) { alert('Error al exportar'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `reporte-${mes}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportando(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
  }).format(n)

  return (
    <div>
      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mes</label>
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
          <select
            value={sucursal}
            onChange={e => setSucursal(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Empleado</label>
          <select
            value={empleadoId}
            onChange={e => setEmpleadoId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {todosEmpleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>)}
          </select>
        </div>
        <button
          onClick={buscar}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Buscar
        </button>
        {(sucursalFiltro || empleadoFiltro) && (
          <button
            onClick={limpiarFiltros}
            className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Limpiar
          </button>
        )}
        <button
          onClick={exportarExcel}
          disabled={exportando || resúmenes.length === 0}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
        >
          {exportando ? 'Exportando...' : '⬇ Exportar Excel'}
        </button>
      </div>

      {(sucursalFiltro || empleadoFiltro) && (
        <div className="flex flex-wrap gap-2 mb-4 -mt-2">
          {sucursalFiltro && (
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
              {sucursales.find(s => s.id === sucursalFiltro)?.nombre ?? 'Sucursal'}
              <button
                onClick={() => { setSucursal(''); router.push(`/reportes?${new URLSearchParams({ mes, ...(empleadoFiltro ? { empleado_id: empleadoFiltro } : {}) })}`) }}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-100"
                aria-label="Quitar filtro de sucursal"
              >×</button>
            </span>
          )}
          {empleadoFiltro && (
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
              {(() => { const e = todosEmpleados.find(e => e.id === empleadoFiltro); return e ? `${e.apellido}, ${e.nombre}` : 'Empleado' })()}
              <button
                onClick={() => { setEmpleadoId(''); router.push(`/reportes?${new URLSearchParams({ mes, ...(sucursalFiltro ? { sucursal_id: sucursalFiltro } : {}) })}`) }}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-100"
                aria-label="Quitar filtro de empleado"
              >×</button>
            </span>
          )}
        </div>
      )}

      {!config && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-yellow-700 text-sm mb-4">
          No hay configuración de liquidación para este período.
        </div>
      )}

      {/* Tabla de resumen */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Empleado</th>
                <th className="text-left px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Sucursal</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Sueldo</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">$/h extra</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Días</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Tardanzas</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Inasistencias</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Hs Extra</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Monto Extra</th>
                <th className="text-right px-3 py-3 text-slate-500 font-semibold whitespace-nowrap">Presentismo</th>
                <th className="text-right px-3 py-3 text-slate-500 font-bold whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resúmenes.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-slate-400">
                    Sin datos para este período
                  </td>
                </tr>
              )}
              {resúmenes.map(({ empleado, resumen }) => {
                const sueldo    = empleado.sueldo ?? 0
                const valorHora = sueldo > 0 ? sueldo / 180 : null
                return (
                <tr key={empleado.id} className="even:bg-slate-50/70 hover:bg-blue-50/60">
                  <td
                    className="px-3 py-4 font-medium text-blue-700 cursor-pointer hover:underline whitespace-nowrap"
                    onClick={() => setSelectedEmpleadoId(empleado.id)}
                  >
                    {empleado.apellido}, {empleado.nombre}
                  </td>
                  <td className="px-3 py-4 text-slate-600 whitespace-nowrap">
                    {empleado.sucursales?.nombre ?? '—'}
                  </td>
                  <td className="px-3 py-4 text-right text-slate-700 whitespace-nowrap">
                    {sueldo > 0 ? fmt(sueldo) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-4 text-right text-slate-500 text-xs whitespace-nowrap">
                    {valorHora ? fmt(valorHora) : '—'}
                  </td>
                  <td className="px-3 py-4 text-right text-slate-700 whitespace-nowrap">{resumen.diasTrabajados}</td>
                  <td className="px-3 py-4 text-right whitespace-nowrap">
                    <span className={resumen.tardanzas >= 3 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                      {resumen.tardanzas}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right whitespace-nowrap">
                    <span className={resumen.inasistencias - resumen.inasistenciasJustificadas >= 1 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                      {resumen.inasistencias}
                    </span>
                    {resumen.inasistenciasJustificadas > 0 && (
                      <span className="block text-xs text-green-600">{resumen.inasistenciasJustificadas} justif.</span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right text-slate-700 whitespace-nowrap">{resumen.horasExtraFormato}</td>
                  <td className="px-3 py-4 text-right text-slate-700 whitespace-nowrap">{fmt(resumen.montoExtra)}</td>
                  <td className="px-3 py-4 text-right whitespace-nowrap">
                    <span className={resumen.presentismo === 0 ? 'text-red-600' : 'text-slate-700'}>
                      {fmt(resumen.presentismo)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                    {fmt(resumen.totalLiquidar)}
                    {resumen.totalLiquidarExacto !== resumen.totalLiquidar && (
                      <span className="block text-xs font-normal text-slate-400">exacto: {fmt(resumen.totalLiquidarExacto)}</span>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cierres automáticos mensuales */}
      <div className="bg-white rounded-2xl shadow overflow-hidden mt-6">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Cierres automáticos</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Se generan solos el día 1 de cada mes, con el mes anterior ya cerrado. Quedan congelados
            aunque después se editen registros de asistencia — sirven para auditar qué se calculó en su momento.
          </p>
        </div>
        {cierresAutomaticos.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">
            Todavía no se generó ningún cierre automático.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2 text-slate-500 font-semibold whitespace-nowrap">Período</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-semibold whitespace-nowrap">Generado el</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold whitespace-nowrap">Empleados</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-semibold whitespace-nowrap">Total liquidado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cierresAutomaticos.map(c => {
                  const total = c.datos.reduce((s, e) => s + (e.totalLiquidar ?? 0), 0)
                  return (
                    <tr key={c.periodo} className="even:bg-slate-50/70 hover:bg-blue-50/60">
                      <td className="px-4 py-3 font-medium text-slate-800 capitalize whitespace-nowrap">
                        {nombreMes(`${c.periodo}-01`)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatFecha(c.generado_en)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{c.datos.length}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedEmpleadoId && (
        <EmpleadoModal
          empleadoId={selectedEmpleadoId}
          onClose={() => setSelectedEmpleadoId(null)}
        />
      )}
    </div>
  )
}
