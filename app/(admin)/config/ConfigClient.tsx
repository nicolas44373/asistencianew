'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConfigLiquidacion, HorarioSucursal } from '@/lib/types/database'

type HorarioConSucursal = HorarioSucursal & { sucursales: { nombre: string } | null }

interface Props {
  configActual: ConfigLiquidacion | null
  historial: ConfigLiquidacion[]
  horariosSucursal: HorarioConSucursal[]
}

export function ConfigClient({ configActual, historial, horariosSucursal }: Props) {
  const router = useRouter()
  const [monto, setMonto]     = useState(configActual?.monto_presentismo?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto_presentismo: parseFloat(monto) }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error'); return }
      setSuccess('Configuración guardada. Vigente a partir de hoy.')
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  // Group branch schedules by branch name
  const sucursalesMap = new Map<string, HorarioConSucursal[]>()
  for (const h of horariosSucursal) {
    const nombre = h.sucursales?.nombre ?? 'Sin sucursal'
    if (!sucursalesMap.has(nombre)) sucursalesMap.set(nombre, [])
    sucursalesMap.get(nombre)!.push(h)
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Info de cálculo */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Cómo se calculan las horas extras</p>
        <p>Valor hora extra = <strong>Sueldo del empleado ÷ 180</strong></p>
        <p className="mt-1 text-blue-600">
          El sueldo de cada empleado se configura en la sección <strong>Empleados</strong>.
        </p>
      </div>

      {/* Formulario: presentismo */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-semibold text-slate-700 mb-4">Monto de presentismo</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Monto presentismo (ARS)
            </label>
            <input
              type="number" min="0" step="0.01" value={monto}
              onChange={e => setMonto(e.target.value)} required
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: 30000.00"
            />
            <p className="text-xs text-slate-400 mt-1">
              Se pierde si el empleado tiene 3 o más tardanzas o inasistencias injustificadas en el mes.
            </p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-3 text-sm text-yellow-700">
            Al guardar se crea una nueva fila vigente desde hoy.
            Los reportes de meses anteriores usan el valor de ese período.
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">{success}</div>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl
                       transition-colors disabled:opacity-60"
          >
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      </div>

      {/* Horarios de sucursal */}
      {sucursalesMap.size > 0 && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">Horarios de sucursal</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Estos son los horarios por defecto que se aplican a todos los empleados de cada sucursal.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from(sucursalesMap.entries()).map(([sucursal, horarios]) => (
              <div key={sucursal} className="px-6 py-4">
                <p className="text-sm font-bold text-slate-800 mb-3">{sucursal}</p>
                <div className="space-y-2">
                  {horarios.map(h => (
                    <HorarioRow key={h.id} horario={h} onSaved={() => router.refresh()} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">Historial de presentismo</h2>
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Vigente desde</th>
                <th className="text-right px-6 py-3 text-slate-500 font-medium">Presentismo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historial.map((c, i) => (
                <tr key={c.id} className={i === 0 ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-3 text-slate-700">
                    {c.vigente_desde}
                    {i === 0 && <span className="ml-2 text-xs text-blue-600 font-medium">(actual)</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-700">{fmt(Number(c.monto_presentismo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Fila editable de horario ──────────────────────────────────

function HorarioRow({ horario, onSaved }: { horario: HorarioConSucursal; onSaved: () => void }) {
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)
  const [form, setForm] = useState({
    hora_entrada:   horario.hora_entrada.slice(0, 5),
    hora_salida:    horario.hora_salida.slice(0, 5),
    umbral_extra:   horario.umbral_extra.slice(0, 5),
    tolerancia_min: horario.tolerancia_min,
  })

  const label = `${horario.turno.charAt(0).toUpperCase() + horario.turno.slice(1)}${horario.es_sabado ? ' · Sábado' : ''}`

  async function guardar() {
    setSaving(true)
    setErr(null)
    const res = await fetch(`/api/admin/sucursales/horarios/${horario.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Error'); setSaving(false); return }
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  const f = (k: keyof typeof form, v: string | number) =>
    setForm(prev => ({ ...prev, [k]: v }))

  if (!editing) {
    return (
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-medium text-slate-700 w-28 inline-block">{label}</span>
          <span className="font-mono text-slate-500 text-xs">
            {form.hora_entrada} → {form.hora_salida}
            {form.tolerancia_min > 0 && ` · tol. ${form.tolerancia_min} min`}
            {` · umbral ${form.umbral_extra}`}
          </span>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Editar
        </button>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['Entrada',     'hora_entrada'],
          ['Salida',      'hora_salida'],
          ['Umbral extra','umbral_extra'],
        ] as [string, keyof typeof form][]).map(([lbl, key]) => (
          <div key={key}>
            <label className="block text-xs text-slate-500 mb-1">{lbl}</label>
            <input
              type="time"
              value={form[key] as string}
              onChange={e => f(key, e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tol. entrada (min)</label>
          <input
            type="number" min={0} max={120}
            value={form.tolerancia_min}
            onChange={e => f('tolerancia_min', Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {err && <p className="text-red-600 text-xs">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setEditing(false); setErr(null) }}
          className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
        <button
          onClick={guardar} disabled={saving}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
