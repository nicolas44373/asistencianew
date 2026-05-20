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

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card label="Total empleados" value={total}     color="blue"   />
        <Card label="Presentes"       value={presentes} color="green"  />
        <Card label="Ausentes"        value={ausentes}  color="red"    />
        <Card label="Tardanzas"       value={tardanzas} color="yellow" />
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">Estado de empleados hoy</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Entrada</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Salida</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empleados.map(emp => {
                const regs   = regPorEmpleado.get(emp.id) ?? []
                const ultimo = regs[regs.length - 1]
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td
                      className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                      onClick={() => setSelectedEmpleadoId(emp.id)}
                    >
                      {emp.apellido}, {emp.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {emp.sucursales?.nombre ?? '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-700">
                      {ultimo?.hora_entrada ? formatHora(ultimo.hora_entrada) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-700">
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
  const colors: Record<string, string> = {
    blue:   'bg-blue-50   text-blue-700   border-blue-200',
    green:  'bg-green-50  text-green-700  border-green-200',
    red:    'bg-red-50    text-red-700    border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  }
  return (
    <div className={`rounded-2xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-4xl font-bold mt-1">{value}</p>
    </div>
  )
}

function EstadoBadge({ regs }: { regs: Array<{ hora_entrada: string | null; hora_salida: string | null; tarde: boolean }> }) {
  if (regs.length === 0) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Ausente</span>
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
