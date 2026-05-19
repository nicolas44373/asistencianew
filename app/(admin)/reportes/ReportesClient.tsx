'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Empleado, RegistroAsistencia, ConfigLiquidacion, Sucursal, HorarioSucursal } from '@/lib/types/database'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias } from '@/lib/reglas/calcularInasistencias'
import { EmpleadoModal } from '@/components/admin/EmpleadoModal'

type EmpleadoRow = Empleado & { sucursales: { nombre: string } | null }

interface Props {
  empleados: EmpleadoRow[]
  registros: RegistroAsistencia[]
  config: ConfigLiquidacion | null
  sucursales: Sucursal[]
  horarios: HorarioSucursal[]
  mesActual: string
  sucursalFiltro: string
}

export function ReportesClient({
  empleados, registros, config, sucursales, horarios, mesActual, sucursalFiltro,
}: Props) {
  const router = useRouter()
  const [mes, setMes]           = useState(mesActual)
  const [sucursal, setSucursal] = useState(sucursalFiltro)
  const [exportando, setExportando] = useState(false)
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null)

  const montoPresentismo = config ? Number(config.monto_presentismo) : 0

  const resúmenes = useMemo(() => {
    const horariosPorSucursal = new Map<string, HorarioSucursal[]>()
    for (const h of horarios) {
      if (!horariosPorSucursal.has(h.sucursal_id)) horariosPorSucursal.set(h.sucursal_id, [])
      horariosPorSucursal.get(h.sucursal_id)!.push(h)
    }

    return empleados.map(emp => {
      const regsEmp     = registros.filter(r => r.empleado_id === emp.id)
      const sueldo      = emp.sueldo ?? 0
      const horariosEmp = emp.sucursal_id ? (horariosPorSucursal.get(emp.sucursal_id) ?? []) : []
      const fechaIngreso = new Date(emp.created_at).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
      const inasistencias = calcularInasistencias(regsEmp, horariosEmp, mes, fechaIngreso)
      const resumen = calcularMes(regsEmp, sueldo, montoPresentismo, inasistencias)
      return { empleado: emp, resumen }
    })
  }, [empleados, registros, montoPresentismo, horarios, mes])

  function buscar() {
    const params = new URLSearchParams({ mes })
    if (sucursal) params.set('sucursal_id', sucursal)
    router.push(`/reportes?${params}`)
  }

  async function exportarExcel() {
    setExportando(true)
    try {
      const params = new URLSearchParams({ mes })
      if (sucursal) params.set('sucursal_id', sucursal)
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
          <select
            value={sucursal}
            onChange={e => setSucursal(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <button
          onClick={buscar}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Buscar
        </button>
        <button
          onClick={exportarExcel}
          disabled={exportando || resúmenes.length === 0}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
        >
          {exportando ? 'Exportando...' : '⬇ Exportar Excel'}
        </button>
      </div>

      {!config && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-yellow-700 text-sm mb-4">
          No hay configuración de liquidación para este período.
        </div>
      )}

      {/* Tabla de resumen */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Sucursal</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Sueldo</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">$/h extra</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Días</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Tardanzas</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Inasistencias</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Hs Extra</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Monto Extra</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Presentismo</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resúmenes.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-10 text-center text-gray-400">
                    Sin datos para este período
                  </td>
                </tr>
              )}
              {resúmenes.map(({ empleado, resumen }) => {
                const sueldo    = empleado.sueldo ?? 0
                const valorHora = sueldo > 0 ? sueldo / 180 : null
                return (
                <tr key={empleado.id} className="hover:bg-gray-50">
                  <td
                    className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                    onClick={() => setSelectedEmpleadoId(empleado.id)}
                  >
                    {empleado.apellido}, {empleado.nombre}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {empleado.sucursales?.nombre ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    {sueldo > 0 ? fmt(sueldo) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500 text-xs">
                    {valorHora ? fmt(valorHora) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">{resumen.diasTrabajados}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={resumen.tardanzas >= 3 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                      {resumen.tardanzas}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={resumen.inasistencias >= 1 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                      {resumen.inasistencias}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">{resumen.horasExtraFormato}</td>
                  <td className="px-6 py-4 text-right text-gray-700">{fmt(resumen.montoExtra)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={resumen.presentismo === 0 ? 'text-red-600' : 'text-gray-700'}>
                      {fmt(resumen.presentismo)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900">
                    {fmt(resumen.totalLiquidar)}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
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
