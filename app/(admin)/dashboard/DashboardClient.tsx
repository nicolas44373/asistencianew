'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatHora } from '@/lib/utils/tiempo'
import { EmpleadoModal } from '@/components/admin/EmpleadoModal'
import type { HorarioSucursal } from '@/lib/types/database'

interface EmpleadoRow {
  id: string
  nombre: string
  apellido: string
  sucursal_id: string | null
  sucursales: { nombre: string } | null
}

interface RegistroRow {
  id: string
  empleado_id: string
  hora_entrada: string | null
  hora_salida: string | null
  tarde: boolean
}

interface Props {
  empleados: EmpleadoRow[]
  registros: RegistroRow[]
  horarios: HorarioSucursal[]
  hoy: string
}

export function DashboardClient({ empleados, registros, horarios, hoy }: Props) {
  const router       = useRouter()
  const supabase     = createClient()
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null)
  const [fSucursal, setFSucursal] = useState('')
  const [fEstado, setFEstado]     = useState('')

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_asistencia' }, () => {
        // Debounce: si llegan varios fichajes en 3s se hace un solo refresh
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => router.refresh(), 3000)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [router, supabase])

  const regPorEmpleado = useMemo(() => {
    const map = new Map<string, RegistroRow[]>()
    for (const r of registros) {
      if (!map.has(r.empleado_id)) map.set(r.empleado_id, [])
      map.get(r.empleado_id)!.push(r)
    }
    return map
  }, [registros])

  const esperadosHoy = useMemo(() => {
    const [y, m, d] = hoy.split('-').map(Number)
    const diaSemana = new Date(y, m - 1, d).getDay()
    return empleados.filter(emp => {
      const horariosEmp = horarios.filter(h => h.sucursal_id === emp.sucursal_id)
      if (horariosEmp.length === 0) return false
      const tieneHorarioSemana = horariosEmp.some(h => !h.es_sabado)
      const tieneHorarioSabado = horariosEmp.some(h => h.es_sabado)
      return (
        (diaSemana >= 1 && diaSemana <= 5 && tieneHorarioSemana) ||
        (diaSemana === 6 && tieneHorarioSabado)
      )
    })
  }, [empleados, horarios, hoy])

  const total     = empleados.length
  const presentes = esperadosHoy.filter(e => regPorEmpleado.has(e.id)).length
  const ausentes  = esperadosHoy.length - presentes
  const tardanzas = registros.filter(r => r.tarde).length

  const sucursalesOpciones = useMemo(() => {
    const map = new Map<string, string>()
    for (const emp of empleados) {
      if (emp.sucursal_id && emp.sucursales?.nombre) map.set(emp.sucursal_id, emp.sucursales.nombre)
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [empleados])

  function estadoDe(regs: RegistroRow[]): 'ausente' | 'completo' | 'tardanza' | 'presente' {
    if (regs.length === 0) return 'ausente'
    const ultimo = regs[regs.length - 1]
    if (ultimo.hora_salida) return 'completo'
    if (ultimo.tarde) return 'tardanza'
    return 'presente'
  }

  const empleadosFiltrados = empleados.filter(emp => {
    if (fSucursal && emp.sucursal_id !== fSucursal) return false
    if (fEstado && estadoDe(regPorEmpleado.get(emp.id) ?? []) !== fEstado) return false
    return true
  })

  const hayFiltros = Boolean(fSucursal || fEstado)

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card label="Total empleados" value={total}     color="blue"   />
        <Card label="Presentes"       value={presentes} color="green"  />
        <Card label="Ausentes"        value={ausentes}  color="red"    />
        <Card label="Tardanzas"       value={tardanzas} color="yellow" />
      </div>

      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
          <select
            value={fSucursal}
            onChange={e => setFSucursal(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {sucursalesOpciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
          <select
            value={fEstado}
            onChange={e => setFEstado(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            <option value="presente">Presente</option>
            <option value="completo">Completó jornada</option>
            <option value="tardanza">Tardanza</option>
            <option value="ausente">Ausente</option>
          </select>
        </div>
        {hayFiltros && (
          <button
            onClick={() => { setFSucursal(''); setFEstado('') }}
            className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Limpiar
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {empleadosFiltrados.length} de {empleados.length} empleados
        </span>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-700">Estado de empleados hoy</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Entrada</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Salida</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empleadosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    Sin empleados para este filtro
                  </td>
                </tr>
              )}
              {empleadosFiltrados.map(emp => {
                const regs   = regPorEmpleado.get(emp.id) ?? []
                const ultimo = regs[regs.length - 1]
                return (
                  <tr key={emp.id} className="even:bg-slate-50/70 hover:bg-blue-50/60 transition-colors">
                    <td
                      className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                      onClick={() => setSelectedEmpleadoId(emp.id)}
                    >
                      {emp.apellido}, {emp.nombre}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {emp.sucursales?.nombre ?? '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {ultimo?.hora_entrada ? formatHora(ultimo.hora_entrada) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {ultimo?.hora_salida ? formatHora(ultimo.hora_salida) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <EstadoBadge regs={regs} />
                    </td>
                  </tr>
                )
              })}
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
    </>
  )
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  const labelColors: Record<string, string> = {
    blue:   'text-blue-600',
    green:  'text-emerald-600',
    red:    'text-red-600',
    yellow: 'text-amber-600',
  }
  const dotColors: Record<string, string> = {
    blue:   'bg-blue-500',
    green:  'bg-emerald-500',
    red:    'bg-red-500',
    yellow: 'bg-amber-500',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${labelColors[color]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
        {label}
      </p>
      <p className="text-4xl font-bold mt-2 text-slate-800 tabular-nums">{value}</p>
    </div>
  )
}

function EstadoBadge({ regs }: { regs: Array<{ hora_entrada: string | null; hora_salida: string | null; tarde: boolean }> }) {
  if (regs.length === 0) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Ausente</span>
  }
  const ultimo = regs[regs.length - 1]
  if (ultimo.hora_salida) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Completó jornada</span>
  }
  if (ultimo.tarde) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tardanza</span>
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Presente</span>
}
