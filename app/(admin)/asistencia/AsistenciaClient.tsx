'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RegistroAsistencia, Sucursal } from '@/lib/types/database'
import { formatHora, formatMinutos } from '@/lib/utils/tiempo'

interface EmpleadoAnidado {
  id: string; nombre: string; apellido: string
  sucursal_id: string | null
  sucursales: { nombre: string } | null
}

type RegistroConEmp = RegistroAsistencia & { empleados: EmpleadoAnidado | null }

interface Props {
  registros: RegistroConEmp[]
  sucursales: Sucursal[]
  empleados: Array<{ id: string; nombre: string; apellido: string }>
  fechaInicial: string
  filtros: { sucursal_id?: string; empleado_id?: string }
}

interface EditForm {
  hora_entrada: string
  hora_salida: string
  motivo_edicion: string
}

export function AsistenciaClient({ registros, sucursales, empleados, fechaInicial, filtros }: Props) {
  const router = useRouter()
  const [fecha, setFecha]         = useState(fechaInicial)
  const [sucursalId, setSucursal] = useState(filtros.sucursal_id ?? '')
  const [empleadoId, setEmpleado] = useState(filtros.empleado_id ?? '')
  const [editando, setEditando]   = useState<RegistroConEmp | null>(null)
  const [editForm, setEditForm]   = useState<EditForm>({ hora_entrada: '', hora_salida: '', motivo_edicion: '' })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function aplicarFiltros() {
    const params = new URLSearchParams({ fecha })
    if (sucursalId) params.set('sucursal_id', sucursalId)
    if (empleadoId) params.set('empleado_id', empleadoId)
    router.push(`/asistencia?${params}`)
  }

  function abrirEdicion(r: RegistroConEmp) {
    setEditando(r)
    setEditForm({
      hora_entrada: r.hora_entrada ? formatHoraInput(r.hora_entrada) : '',
      hora_salida:  r.hora_salida  ? formatHoraInput(r.hora_salida)  : '',
      motivo_edicion: '',
    })
    setError(null)
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    if (!editForm.motivo_edicion.trim()) {
      setError('El motivo de edición es obligatorio')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/asistencia/${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: editando.fecha,
          hora_entrada: editForm.hora_entrada,
          hora_salida:  editForm.hora_salida,
          motivo_edicion: editForm.motivo_edicion,
          turno: editando.turno,
          empleado_id: editando.empleado_id,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error'); return }

      setEditando(null)
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
          <select
            value={sucursalId}
            onChange={e => setSucursal(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empleado</label>
          <select
            value={empleadoId}
            onChange={e => setEmpleado(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {empleados.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.apellido}, {emp.nombre}</option>
            ))}
          </select>
        </div>
        <button
          onClick={aplicarFiltros}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Buscar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Turno</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Entrada</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Salida</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Extras</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registros.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                    Sin registros para este filtro
                  </td>
                </tr>
              )}
              {registros.map(r => {
                const emp = r.empleados
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {emp?.apellido}, {emp?.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{emp?.sucursales?.nombre ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{r.turno ?? '—'}</td>
                    <td className="px-6 py-4 font-mono">{r.hora_entrada ? formatHora(r.hora_entrada) : '—'}</td>
                    <td className="px-6 py-4 font-mono">{r.hora_salida  ? formatHora(r.hora_salida)  : '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {r.tarde ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tardanza</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">A tiempo</span>
                        )}
                        {r.egreso_anticipado && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Retiro ant.</span>
                        )}
                        {r.editado_por && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">Editado</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {r.minutos_extra > 0 ? formatMinutos(r.minutos_extra) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => abrirEdicion(r)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Editar registro</h2>
            <p className="text-gray-500 text-sm mb-4">
              {editando.empleados?.nombre} — {editando.fecha}
            </p>

            <form onSubmit={guardarEdicion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hora entrada</label>
                <input
                  type="time"
                  value={editForm.hora_entrada}
                  onChange={e => setEditForm(f => ({ ...f, hora_entrada: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hora salida</label>
                <input
                  type="time"
                  value={editForm.hora_salida}
                  onChange={e => setEditForm(f => ({ ...f, hora_salida: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Motivo de edición <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={editForm.motivo_edicion}
                  onChange={e => setEditForm(f => ({ ...f, motivo_edicion: e.target.value }))}
                  rows={2}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Motivo obligatorio..."
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function formatHoraInput(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
