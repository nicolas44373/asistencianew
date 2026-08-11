'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Empleado, Sucursal } from '@/lib/types/database'
import { EmpleadoModal } from '@/components/admin/EmpleadoModal'
import { HorarioPersonalModal } from '@/components/admin/HorarioPersonalModal'

type EmpleadoRow = Empleado & { sucursales: { nombre: string } | null }

interface Props {
  empleados: EmpleadoRow[]
  sucursales: Sucursal[]
}

type FormMode = 'crear' | 'editar' | null

interface FormData {
  nombre: string
  apellido: string
  dni: string
  email: string
  password: string
  sucursal_id: string
  rol: 'empleado' | 'admin' | 'administracion'
  activo: boolean
  sueldo: string
  resetPassword: boolean
  nuevaPassword: string
  resetDevice: boolean
  permitir_otra_sucursal: boolean
}

const defaultForm: FormData = {
  nombre: '', apellido: '', dni: '', email: '', password: '',
  sucursal_id: '', rol: 'empleado', activo: true,
  sueldo: '', resetPassword: false, nuevaPassword: '', resetDevice: false,
  permitir_otra_sucursal: false,
}

export function EmpleadosClient({ empleados, sucursales }: Props) {
  const router = useRouter()
  const [mode, setMode]         = useState<FormMode>(null)
  const [selected, setSelected] = useState<Empleado | null>(null)
  const [form, setForm]         = useState<FormData>(defaultForm)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const [selectedEmpleadoId, setSelectedEmpleadoId]         = useState<string | null>(null)
  const [horarioEmpleado, setHorarioEmpleado] = useState<EmpleadoRow | null>(null)
  const [empleadoAEliminar, setEmpleadoAEliminar] = useState<EmpleadoRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Filtros (client-side: el listado ya viene completo del servidor) ──
  const [fSucursal, setFSucursal] = useState('')
  const [fRol, setFRol]           = useState('')
  const [fEstado, setFEstado]     = useState('')
  const [fBusqueda, setFBusqueda] = useState('')

  const hayFiltros = Boolean(fSucursal || fRol || fEstado || fBusqueda)

  function limpiarFiltros() {
    setFSucursal(''); setFRol(''); setFEstado(''); setFBusqueda('')
  }

  const empleadosFiltrados = empleados.filter(emp => {
    if (fSucursal && emp.sucursal_id !== fSucursal) return false
    if (fRol && emp.rol !== fRol) return false
    if (fEstado === 'activo' && !emp.activo) return false
    if (fEstado === 'inactivo' && emp.activo) return false
    if (fBusqueda) {
      const q = fBusqueda.trim().toLowerCase()
      const enNombre = `${emp.apellido} ${emp.nombre}`.toLowerCase().includes(q)
      const enDni = (emp.dni ?? '').includes(q)
      if (!enNombre && !enDni) return false
    }
    return true
  })

  function abrirCrear() {
    setForm(defaultForm)
    setSelected(null)
    setMode('crear')
    setError(null)
    setSuccess(null)
  }

  function abrirEditar(emp: EmpleadoRow) {
    setForm({
      ...defaultForm,
      nombre:      emp.nombre,
      apellido:    emp.apellido,
      dni:         emp.dni ?? '',
      sucursal_id: emp.sucursal_id ?? '',
      rol:         emp.rol,
      activo:      emp.activo,
      sueldo:      emp.sueldo != null ? String(emp.sueldo) : '',
      permitir_otra_sucursal: emp.permitir_otra_sucursal ?? false,
    })
    setSelected(emp)
    setMode('editar')
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const url    = mode === 'crear' ? '/api/admin/empleados' : `/api/admin/empleados/${selected?.id}`
      const method = mode === 'crear' ? 'POST' : 'PATCH'

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok) { setError(json.error ?? 'Error'); return }

      setSuccess(mode === 'crear' ? 'Empleado creado exitosamente' : 'Empleado actualizado')
      setMode(null)
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const f = (k: keyof FormData, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  async function confirmarEliminar() {
    if (!empleadoAEliminar) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res  = await fetch(`/api/admin/empleados/${empleadoAEliminar.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { setDeleteError(json.error ?? 'Error'); return }
      setEmpleadoAEliminar(null)
      setSuccess('Empleado eliminado')
      router.refresh()
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={abrirCrear}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl
                     font-medium text-sm transition-colors"
        >
          + Nuevo empleado
        </button>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          {success}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Buscar</label>
          <input
            type="text"
            value={fBusqueda}
            onChange={e => setFBusqueda(e.target.value)}
            placeholder="Nombre, apellido o DNI..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
          <select
            value={fSucursal}
            onChange={e => setFSucursal(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
          <select
            value={fRol}
            onChange={e => setFRol(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            <option value="empleado">Empleado</option>
            <option value="administracion">Administración</option>
            <option value="admin">Admin</option>
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
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        {hayFiltros && (
          <button
            onClick={limpiarFiltros}
            className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Limpiar
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {empleadosFiltrados.length} de {empleados.length} empleados
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">DNI</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Rol</th>
                <th className="text-right px-6 py-3 text-slate-500 font-medium">Sueldo</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Estado</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Dispositivo</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empleadosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    Sin empleados para este filtro
                  </td>
                </tr>
              )}
              {empleadosFiltrados.map(emp => (
                <tr key={emp.id} className="even:bg-slate-50/70 hover:bg-blue-50/60">
                  <td
                    className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                    onClick={() => setSelectedEmpleadoId(emp.id)}
                  >
                    {emp.apellido}, {emp.nombre}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-600">
                    {emp.dni ?? <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {emp.sucursales?.nombre ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.rol === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : emp.rol === 'administracion'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {emp.rol === 'administracion' ? 'Administración' : emp.rol}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-700">
                    {emp.sueldo != null
                      ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(emp.sueldo)
                      : <span className="text-slate-400 text-xs">Sin asignar</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>{emp.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="px-6 py-4">
                    {emp.device_id ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Registrado</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Sin registrar</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => abrirEditar(emp)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setHorarioEmpleado(emp)}
                        className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                      >
                        Horario
                      </button>
                      <button
                        onClick={() => { setEmpleadoAEliminar(emp); setDeleteError(null) }}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {horarioEmpleado && (
        <HorarioPersonalModal
          empleadoId={horarioEmpleado.id}
          empleadoNombre={`${horarioEmpleado.nombre} ${horarioEmpleado.apellido}`}
          onClose={() => setHorarioEmpleado(null)}
        />
      )}

      {empleadoAEliminar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Eliminar empleado</h2>
            <p className="text-sm text-slate-600 mb-4">
              ¿Seguro que querés eliminar a{' '}
              <span className="font-medium">
                {empleadoAEliminar.nombre} {empleadoAEliminar.apellido}
              </span>? Esta acción es permanente y borra también su historial de
              asistencia, horarios y justificaciones. No se puede deshacer.
            </p>

            {deleteError && (
              <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEmpleadoAEliminar(null)}
                disabled={deleting}
                className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium
                           text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminar}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2
                           text-sm font-medium transition-colors disabled:opacity-60"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {mode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              {mode === 'crear' ? 'Nuevo empleado' : 'Editar empleado'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" value={form.nombre}
                  onChange={v => f('nombre', v)} required />
                <Field label="Apellido" value={form.apellido}
                  onChange={v => f('apellido', v)} required />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={e => f('rol', e.target.value as 'empleado' | 'admin' | 'administracion')}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="empleado">Empleado</option>
                  <option value="administracion">Administración</option>
                  <option value="admin">Admin (panel)</option>
                </select>
              </div>

              {/* Credenciales según rol */}
              {(form.rol === 'empleado' || form.rol === 'administracion') ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">DNI</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.dni}
                    onChange={e => f('dni', e.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="Ej: 40123456"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-0.5">Ingresa con su DNI desde la app de fichaje</p>
                </div>
              ) : (
                <>
                  <Field label="Email" type="email" value={form.email}
                    onChange={v => f('email', v)}
                    required={mode === 'crear'} placeholder="admin@gmail.com" />
                  {mode === 'crear' && (
                    <Field label="Contraseña" type="password" value={form.password}
                      onChange={v => f('password', v)} required />
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sucursal</label>
                <select
                  value={form.sucursal_id}
                  onChange={e => f('sucursal_id', e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>

              {(form.rol === 'empleado' || form.rol === 'administracion') && (
                <label className="flex items-center gap-2 text-sm mt-1">
                  <input
                    type="checkbox"
                    checked={form.permitir_otra_sucursal}
                    onChange={e => f('permitir_otra_sucursal', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Permitir fichar desde cualquier sucursal
                </label>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sueldo mensual (ARS)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.sueldo}
                  onChange={e => f('sueldo', e.target.value)}
                  placeholder="Ej: 270000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {form.sueldo && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Valor hora extra: ${(Number(form.sueldo) / 180).toFixed(2)}
                  </p>
                )}
              </div>

              {mode === 'editar' && (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={e => f('activo', e.target.checked)}
                      className="rounded"
                    />
                    Empleado activo
                  </label>

                  {form.rol === 'admin' && (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.resetPassword}
                          onChange={e => f('resetPassword', e.target.checked)}
                          className="rounded"
                        />
                        Cambiar contraseña
                      </label>
                      {form.resetPassword && (
                        <Field label="Nueva contraseña" type="password"
                          value={form.nuevaPassword}
                          onChange={v => f('nuevaPassword', v)} required />
                      )}
                    </>
                  )}

                  {(form.rol === 'empleado' || form.rol === 'administracion') && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.resetDevice}
                        onChange={e => f('resetDevice', e.target.checked)}
                        className="rounded"
                      />
                      Resetear dispositivo registrado
                    </label>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium
                             text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2
                             text-sm font-medium transition-colors disabled:opacity-60"
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

function Field({
  label, type = 'text', value, onChange, required, placeholder,
}: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
