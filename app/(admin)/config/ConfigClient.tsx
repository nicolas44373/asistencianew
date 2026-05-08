'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConfigLiquidacion } from '@/lib/types/database'

interface Props {
  configActual: ConfigLiquidacion | null
  historial: ConfigLiquidacion[]
}

export function ConfigClient({ configActual, historial }: Props) {
  const router = useRouter()
  const [monto, setMonto]   = useState(configActual?.monto_presentismo?.toString() ?? '')
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

  return (
    <div className="max-w-xl">
      {/* Info de cálculo */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-800">
        <p className="font-semibold mb-1">Cómo se calculan las horas extras</p>
        <p>Valor hora extra = <strong>Sueldo del empleado ÷ 180</strong></p>
        <p className="mt-1 text-blue-600">
          El sueldo de cada empleado se configura en la sección <strong>Empleados</strong>.
        </p>
      </div>

      {/* Formulario: solo presentismo */}
      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Monto de presentismo</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto presentismo (ARS)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: 30000.00"
            />
            <p className="text-xs text-gray-400 mt-1">
              Se pierde si el empleado tiene 3 o más tardanzas en el mes.
            </p>
          </div>

          <div className="bg-yellow-50 rounded-xl p-3 text-sm text-yellow-700">
            Al guardar se crea una nueva fila vigente desde hoy.
            Los reportes de meses anteriores usan el valor de ese período.
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl
                       transition-colors disabled:opacity-60"
          >
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Historial de presentismo</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Vigente desde</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Presentismo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historial.map((c, i) => (
                <tr key={c.id} className={i === 0 ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-3 text-gray-700">
                    {c.vigente_desde}
                    {i === 0 && <span className="ml-2 text-xs text-blue-600 font-medium">(actual)</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">{fmt(Number(c.monto_presentismo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
