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
}

const defaultForm: FormData = {
  nombre: '', apellido: '', dni: '', email: '', password: '',
  sucursal_id: '', rol: 'empleado', activo: true,
  sueldo: '', resetPassword: false, nuevaPassword: '', resetDevice: false,
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

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">DNI</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Rol</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Sueldo</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Dispositivo</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empleados.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td
                    className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline"
                    onClick={() => setSelectedEmpleadoId(emp.id)}
                  >
                    {emp.apellido}, {emp.nombre}
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-600">
                    {emp.dni ?? <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
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
                  <td className="px-6 py-4 text-right font-mono text-gray-700">
                    {emp.sueldo != null
                      ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(emp.sueldo)
                      : <span className="text-gray-400 text-xs">Sin asignar</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{emp.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="px-6 py-4">
                    {emp.device_id ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Registrado</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Sin registrar</span>
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

      {/* Modal */}
      {mode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={e => f('rol', e.target.value as 'empleado' | 'admin' | 'administracion')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="empleado">Empleado</option>
                  <option value="administracion">Administración</option>
                  <option value="admin">Admin (panel)</option>
                </select>
              </div>

              {/* Credenciales según rol */}
              {(form.rol === 'empleado' || form.rol === 'administracion') ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">DNI</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.dni}
                    onChange={e => f('dni', e.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="Ej: 40123456"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Ingresa con su DNI desde la app de fichaje</p>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Sucursal</label>
                <select
                  value={form.sucursal_id}
                  onChange={e => f('sucursal_id', e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Sueldo mensual (ARS)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.sueldo}
                  onChange={e => f('sueldo', e.target.value)}
                  placeholder="Ej: 270000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {form.sueldo && (
                  <p className="text-xs text-gray-400 mt-0.5">
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
                  className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium
                             text-gray-600 hover:bg-gray-50 transition-colors"
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
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
