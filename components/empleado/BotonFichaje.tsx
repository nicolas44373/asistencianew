'use client'

import { useState } from 'react'
import type { RegistroAsistencia } from '@/lib/types/database'
import { formatHora } from '@/lib/utils/tiempo'

interface Props {
  registros: RegistroAsistencia[]
  onFichaje: (registros: RegistroAsistencia[]) => void
}

const DEVICE_KEY = 'asistencia_device_id'

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function getEstado(registros: RegistroAsistencia[]): 'sin-entrada' | 'sin-salida' {
  if (registros.length === 0) return 'sin-entrada'
  const ultimo = registros[registros.length - 1]
  if (ultimo.hora_entrada && !ultimo.hora_salida) return 'sin-salida'
  return 'sin-entrada'
}

function obtenerUbicacion(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('sin-soporte'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 0,
    })
  })
}

export function BotonFichaje({ registros, onFichaje }: Props) {
  const [loading, setLoading]   = useState(false)
  const [ubicando, setUbicando] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const estado = getEstado(registros)

  async function fichar() {
    setLoading(true)
    setFeedback(null)
    setError(null)

    // ── 1. Identificar dispositivo ────────────────────────────
    const deviceId = getOrCreateDeviceId()

    // ── 2. Obtener ubicación GPS ──────────────────────────────
    setUbicando(true)
    let lat: number
    let lng: number
    try {
      const pos = await obtenerUbicacion()
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch (err) {
      const msg =
        err instanceof GeolocationPositionError && err.code === 1
          ? 'Debés permitir el acceso a tu ubicación para fichar. Revisá los permisos del navegador.'
          : err instanceof Error && err.message === 'sin-soporte'
          ? 'Tu dispositivo no soporta GPS.'
          : 'No se pudo obtener tu ubicación. Verificá que el GPS esté activado.'
      setError(msg)
      setUbicando(false)
      setLoading(false)
      return
    } finally {
      setUbicando(false)
    }

    // ── 3. Llamar a la API con dispositivo + coordenadas ──────
    try {
      const res = await fetch('/api/fichar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, deviceId }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Error al fichar')
        return
      }

      const tipo     = json.tipo as string
      const registro = json.registro as RegistroAsistencia

      if (tipo === 'ingreso') {
        setFeedback(`Ingreso registrado a las ${formatHora(registro.hora_entrada!)}`)
        onFichaje([...registros, registro])
      } else if (tipo === 'salida') {
        setFeedback(`Salida registrada a las ${formatHora(registro.hora_salida!)}`)
        onFichaje(registros.map(r => r.id === registro.id ? registro : r))
      } else {
        setFeedback('Jornada ya completada')
      }
    } catch {
      setError('Error de conexión. Verificá tu señal.')
    } finally {
      setLoading(false)
    }
  }

  const config = {
    'sin-entrada': {
      label: 'REGISTRAR INGRESO',
      color: 'bg-green-500 hover:bg-green-600 active:bg-green-700',
      icon: '→',
    },
    'sin-salida': {
      label: 'REGISTRAR SALIDA',
      color: 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700',
      icon: '←',
    },
  }[estado]

  const labelCargando = ubicando ? 'Obteniendo ubicación...' : 'Registrando...'

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={fichar}
        disabled={loading}
        className={`
          w-64 h-20 rounded-2xl text-white font-bold text-xl shadow-lg
          transition-all active:scale-95 flex items-center justify-center gap-3
          min-h-[80px] ${config.color}
          disabled:opacity-60
        `}
        aria-label={config.label}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-1">
            <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span className="text-xs font-normal">{labelCargando}</span>
          </div>
        ) : (
          <>
            <span className="text-2xl">{config.icon}</span>
            <span>{config.label}</span>
          </>
        )}
      </button>

      {feedback && (
        <div className="bg-green-100 border border-green-300 text-green-800 rounded-xl px-4 py-3 text-center text-sm font-medium w-full max-w-xs">
          {feedback}
        </div>
      )}
      {error && (
        <div className="bg-red-100 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-center text-sm w-full max-w-xs">
          {error}
        </div>
      )}
    </div>
  )
}
