'use client'

import { useState, useEffect, useCallback } from 'react'
import type { HorarioEmpleado, Turno } from '@/lib/types/database'

interface Props {
  empleadoId: string
  empleadoNombre: string
  onClose: () => void
}

const TURNOS: Turno[] = ['mañana', 'tarde', 'unico']

const defaultForm = {
  turno:         'unico' as Turno,
  hora_entrada:  '',
  hora_salida:   '',
  umbral_extra:  '',
  tolerancia_min: 0,
  es_sabado:     false,
}

export function HorarioPersonalModal({ empleadoId, empleadoNombre, onClose }: Props) {
  const [horarios, setHorarios] = useState<HorarioEmpleado[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [form, setForm]         = useState(defaultForm)
  const [mostrarForm, setMostrarForm] = useState(false)

  const fetchHorarios = useCallback(async () => {
    setLoading(true)
    const res  = await fetch(`/api/admin/empleados/${empleadoId}/horarios`)
    const json = await res.json()
    setHorarios(json.horarios ?? [])
    setLoading(false)
  }, [empleadoId])

  useEffect(() => { fetchHorarios() }, [fetchHorarios])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/empleados/${empleadoId}/horarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Error'); setSaving(false); return }
    setForm(defaultForm)
    setMostrarForm(false)
    await fetchHorarios()
    setSaving(false)
  }

  async function eliminar(horarioId: string) {
    await fetch(`/api/admin/empleados/${empleadoId}/horarios/${horarioId}`, { method: 'DELETE' })
    await fetchHorarios()
  }

  const f = (k: keyof typeof form, v: string | number | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Horario personal</h2>
            <p className="text-sm text-gray-500 mt-0.5">{empleadoNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Lista de horarios existentes */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : horarios.length === 0 && !mostrarForm ? (
            <p className="text-gray-400 text-sm text-center py-6">
              Sin horario personal — usa el horario de la sucursal
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {horarios.map(h => (
                <div key={h.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 capitalize">{h.turno}</span>
                      {h.es_sabado && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Sábado</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {h.hora_entrada} → {h.hora_salida}
                      {h.tolerancia_min > 0 && ` · tol. ${h.tolerancia_min} min`}
                      {` · umbral ${h.umbral_extra}`}
                    </p>
                  </div>
                  <button
                    onClick={() => eliminar(h.id)}
                    className="text-red-400 hover:text-red-600 transition-colors text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario nuevo horario */}
          {mostrarForm ? (
            <form onSubmit={guardar} className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Nuevo horario</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Turno</label>
                  <select
                    value={form.turno}
                    onChange={e => f('turno', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TURNOS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tolerancia entrada (min)</label>
                  <input
                    type="number" min={0} max={120}
                    value={form.tolerancia_min}
                    onChange={e => f('tolerancia_min', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora entrada</label>
                  <input
                    type="time" required value={form.hora_entrada}
                    onChange={e => f('hora_entrada', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora salida</label>
                  <input
                    type="time" required value={form.hora_salida}
                    onChange={e => f('hora_salida', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Umbral extra</label>
                  <input
                    type="time" required value={form.umbral_extra}
                    onChange={e => f('umbral_extra', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.es_sabado}
                  onChange={e => f('es_sabado', e.target.checked)}
                  className="rounded"
                />
                Aplica sábados
              </label>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setMostrarForm(false); setError(null) }}
                  className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setMostrarForm(true)}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Agregar horario
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
