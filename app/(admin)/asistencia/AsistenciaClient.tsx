'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { RegistroAsistencia, Sucursal, HorarioSucursal, Justificacion } from '@/lib/types/database'
import { formatHora, formatMinutos } from '@/lib/utils/tiempo'
import { EmpleadoModal } from '@/components/admin/EmpleadoModal'

interface EmpleadoAnidado {
  id: string; nombre: string; apellido: string
  sucursal_id: string | null
  sucursales: { nombre: string } | null
}

type RegistroConEmp = RegistroAsistencia & { empleados: EmpleadoAnidado | null }

interface Props {
  registros: RegistroConEmp[]
  sucursales: Sucursal[]
  empleados: Array<{ id: string; nombre: string; apellido: string; sucursal_id: string | null }>
  horarios: HorarioSucursal[]
  justificaciones: Justificacion[]
  fechaInicial: string
  filtros: { sucursal_id?: string; empleado_id?: string }
}

interface JustificandoState {
  empleado_id: string
  nombre: string
  existente: Justificacion | null
}

interface EditForm {
  hora_entrada: string
  hora_salida: string
  motivo_edicion: string
}

interface RegistroNuevoForm {
  hora_entrada: string
  hora_salida: string
  motivo_edicion: string
}

interface RegistrandoState {
  empleado_id: string
  nombre: string
  tipo: 'ingreso' | 'salida'
  registroId?: string
  turno?: string
}

function horaActualLocal(): string {
  return new Date().toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function AsistenciaClient({ registros, sucursales, empleados, horarios, justificaciones, fechaInicial, filtros }: Props) {
  const router = useRouter()
  const [fecha, setFecha]         = useState(fechaInicial)
  const [sucursalId, setSucursal] = useState(filtros.sucursal_id ?? '')
  const [empleadoId, setEmpleado] = useState(filtros.empleado_id ?? '')
  const [editando, setEditando]   = useState<RegistroConEmp | null>(null)
  const [editForm, setEditForm]   = useState<EditForm>({ hora_entrada: '', hora_salida: '', motivo_edicion: '' })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null)

  // Estado para justificaciones
  const [justificando, setJustificando]   = useState<JustificandoState | null>(null)
  const [justForm, setJustForm]           = useState<{ justificada: boolean; motivo: string }>({ justificada: true, motivo: '' })
  const [justLoading, setJustLoading]     = useState(false)
  const [justError, setJustError]         = useState<string | null>(null)

  // Mapa rápido empleado_id → justificacion (para la fecha seleccionada)
  const justMap = useMemo(() => {
    const m = new Map<string, Justificacion>()
    for (const j of justificaciones) m.set(j.empleado_id, j)
    return m
  }, [justificaciones])

  // Estado para registro manual
  const [registrando, setRegistrando] = useState<RegistrandoState | null>(null)
  const [regForm, setRegForm]         = useState<RegistroNuevoForm>({ hora_entrada: '', hora_salida: '', motivo_edicion: '' })
  const [regLoading, setRegLoading]   = useState(false)
  const [regError, setRegError]       = useState<string | null>(null)

  // Empleados que debían trabajar ese día pero no tienen ningún registro
  const ausentes = useMemo(() => {
    const [y, m, d]  = fechaInicial.split('-').map(Number)
    const diaSemana  = new Date(y, m - 1, d).getDay() // 0=Dom … 6=Sab
    const conRegistro = new Set(registros.map(r => r.empleado_id))

    return empleados.filter(emp => {
      if (filtros.empleado_id && emp.id !== filtros.empleado_id) return false
      if (filtros.sucursal_id && emp.sucursal_id !== filtros.sucursal_id) return false
      if (conRegistro.has(emp.id)) return false

      const horariosEmp = horarios.filter(h => h.sucursal_id === emp.sucursal_id)
      if (horariosEmp.length === 0) return false

      const tieneHorarioSemana = horariosEmp.some(h => !h.es_sabado)
      const tieneHorarioSabado = horariosEmp.some(h => h.es_sabado)

      return (
        (diaSemana >= 1 && diaSemana <= 5 && tieneHorarioSemana) ||
        (diaSemana === 6 && tieneHorarioSabado)
      )
    })
  }, [fechaInicial, registros, empleados, horarios, filtros])

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

  function abrirJustificacion(emp: { id: string; nombre: string; apellido: string }) {
    const existente = justMap.get(emp.id) ?? null
    setJustificando({ empleado_id: emp.id, nombre: `${emp.apellido}, ${emp.nombre}`, existente })
    setJustForm({ justificada: existente?.justificada ?? true, motivo: existente?.motivo ?? '' })
    setJustError(null)
  }

  async function guardarJustificacion(e: React.FormEvent) {
    e.preventDefault()
    if (!justificando) return
    setJustLoading(true)
    setJustError(null)
    try {
      const res = await fetch('/api/admin/justificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleado_id: justificando.empleado_id,
          fecha,
          justificada: justForm.justificada,
          motivo: justForm.motivo || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setJustError(json.error ?? 'Error'); return }
      setJustificando(null)
      router.refresh()
    } catch {
      setJustError('Error de conexión')
    } finally {
      setJustLoading(false)
    }
  }

  async function eliminarJustificacion() {
    if (!justificando) return
    setJustLoading(true)
    setJustError(null)
    try {
      const res = await fetch(
        `/api/admin/justificaciones?empleado_id=${justificando.empleado_id}&fecha=${fecha}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (!res.ok) { setJustError(json.error ?? 'Error'); return }
      setJustificando(null)
      router.refresh()
    } catch {
      setJustError('Error de conexión')
    } finally {
      setJustLoading(false)
    }
  }

  function abrirRegistroIngreso(emp: { id: string; nombre: string; apellido: string }) {
    setRegistrando({ empleado_id: emp.id, nombre: `${emp.apellido}, ${emp.nombre}`, tipo: 'ingreso' })
    setRegForm({ hora_entrada: horaActualLocal(), hora_salida: '', motivo_edicion: '' })
    setRegError(null)
  }

  function abrirRegistroSalida(r: RegistroConEmp) {
    const nombre = r.empleados ? `${r.empleados.apellido}, ${r.empleados.nombre}` : '—'
    setRegistrando({ empleado_id: r.empleado_id, nombre, tipo: 'salida', registroId: r.id, turno: r.turno ?? undefined })
    setRegForm({ hora_entrada: r.hora_entrada ? formatHoraInput(r.hora_entrada) : '', hora_salida: horaActualLocal(), motivo_edicion: '' })
    setRegError(null)
  }

  async function guardarRegistro(e: React.FormEvent) {
    e.preventDefault()
    if (!registrando) return
    if (!regForm.motivo_edicion.trim()) { setRegError('El motivo es obligatorio'); return }

    setRegLoading(true)
    setRegError(null)

    try {
      if (registrando.tipo === 'salida' && registrando.registroId) {
        // Actualizar registro existente con la salida
        const res = await fetch(`/api/admin/asistencia/${registrando.registroId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha,
            hora_entrada: regForm.hora_entrada,
            hora_salida:  regForm.hora_salida,
            motivo_edicion: regForm.motivo_edicion,
            turno: registrando.turno,
            empleado_id: registrando.empleado_id,
          }),
        })
        const json = await res.json()
        if (!res.ok) { setRegError(json.error ?? 'Error'); return }
      } else {
        // Crear nuevo registro de ingreso (con salida opcional)
        const res = await fetch('/api/admin/asistencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empleado_id:    registrando.empleado_id,
            fecha,
            hora_entrada:   regForm.hora_entrada,
            hora_salida:    regForm.hora_salida || null,
            motivo_edicion: regForm.motivo_edicion,
          }),
        })
        const json = await res.json()
        if (!res.ok) { setRegError(json.error ?? 'Error'); return }
      }

      setRegistrando(null)
      router.refresh()
    } catch {
      setRegError('Error de conexión')
    } finally {
      setRegLoading(false)
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
                    <td
                      className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                      onClick={() => emp && setSelectedEmpleadoId(emp.id)}
                    >
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
                      <div className="flex gap-3 items-center">
                        <button
                          onClick={() => abrirEdicion(r)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Editar
                        </button>
                        {r.hora_entrada && !r.hora_salida && (
                          <button
                            onClick={() => abrirRegistroSalida(r)}
                            className="text-emerald-600 hover:text-emerald-800 text-sm font-medium"
                          >
                            Reg. salida
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Filas de ausentes */}
              {ausentes.map(emp => {
                const sucursalNombre = sucursales.find(s => s.id === emp.sucursal_id)?.nombre ?? '—'
                const just = justMap.get(emp.id)
                return (
                  <tr key={`ausente-${emp.id}`} className="bg-gray-50/60">
                    <td
                      className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                      onClick={() => setSelectedEmpleadoId(emp.id)}
                    >
                      {emp.apellido}, {emp.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{sucursalNombre}</td>
                    <td className="px-6 py-4 text-gray-400">—</td>
                    <td className="px-6 py-4 text-gray-400">—</td>
                    <td className="px-6 py-4 text-gray-400">—</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                          Ausente
                        </span>
                        {just ? (
                          just.justificada
                            ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Justificada</span>
                            : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Injustificada</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">Sin justificar</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400">—</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3 items-center">
                        <button
                          onClick={() => abrirJustificacion(emp)}
                          className="text-violet-600 hover:text-violet-800 text-sm font-medium"
                        >
                          {just ? 'Ver/Editar' : 'Justificar'}
                        </button>
                        <button
                          onClick={() => abrirRegistroIngreso(emp)}
                          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                          Registrar
                        </button>
                      </div>
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

      {/* Modal justificación */}
      {justificando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Justificación de inasistencia</h2>
            <p className="text-gray-500 text-sm mb-4">{justificando.nombre} — {fecha}</p>

            <form onSubmit={guardarJustificacion} className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">¿La inasistencia está justificada?</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="justificada"
                      checked={justForm.justificada}
                      onChange={() => setJustForm(f => ({ ...f, justificada: true }))}
                      className="accent-green-600"
                    />
                    <span className="text-sm font-medium text-green-700">Justificada</span>
                    <span className="text-xs text-gray-400">(no pierde presentismo)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="justificada"
                      checked={!justForm.justificada}
                      onChange={() => setJustForm(f => ({ ...f, justificada: false }))}
                      className="accent-red-600"
                    />
                    <span className="text-sm font-medium text-red-700">Injustificada</span>
                    <span className="text-xs text-gray-400">(pierde presentismo)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Motivo <span className="text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={justForm.motivo}
                  onChange={e => setJustForm(f => ({ ...f, motivo: e.target.value }))}
                  rows={2}
                  placeholder="Ej: turno médico, accidente, etc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>

              {justError && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{justError}</p>
              )}

              <div className="flex gap-2">
                {justificando.existente && (
                  <button
                    type="button"
                    onClick={eliminarJustificacion}
                    disabled={justLoading}
                    className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm transition-colors disabled:opacity-60"
                  >
                    Quitar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setJustificando(null)}
                  className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={justLoading}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {justLoading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal registro manual */}
      {registrando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              {registrando.tipo === 'ingreso' ? 'Registrar asistencia' : 'Registrar salida'}
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              {registrando.nombre} — {fecha}
            </p>

            <form onSubmit={guardarRegistro} className="space-y-4">
              {registrando.tipo === 'ingreso' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Hora de entrada <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={regForm.hora_entrada}
                    onChange={e => setRegForm(f => ({ ...f, hora_entrada: e.target.value }))}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Hora de salida {registrando.tipo === 'salida' && <span className="text-red-500">*</span>}
                  {registrando.tipo === 'ingreso' && <span className="text-gray-400">(opcional)</span>}
                </label>
                <input
                  type="time"
                  value={regForm.hora_salida}
                  onChange={e => setRegForm(f => ({ ...f, hora_salida: e.target.value }))}
                  required={registrando.tipo === 'salida'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={regForm.motivo_edicion}
                  onChange={e => setRegForm(f => ({ ...f, motivo_edicion: e.target.value }))}
                  rows={2}
                  required
                  placeholder="Ej: sin celular, registro manual..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {regError && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{regError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRegistrando(null)}
                  className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {regLoading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
