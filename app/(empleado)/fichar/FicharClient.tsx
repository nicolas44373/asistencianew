'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RelojTiempoReal } from '@/components/empleado/RelojTiempoReal'
import { BotonFichaje } from '@/components/empleado/BotonFichaje'
import { HistorialDia } from '@/components/empleado/HistorialDia'
import type { RegistroAsistencia } from '@/lib/types/database'

interface SucursalMin { nombre: string }
interface EmpleadoMin {
  id: string; nombre: string; apellido: string; rol: string
  sucursales: SucursalMin | null
}

interface Props {
  empleado: EmpleadoMin
  registrosIniciales: RegistroAsistencia[]
}

export function FicharClient({ empleado, registrosIniciales }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [registros, setRegistros] = useState<RegistroAsistencia[]>(registrosIniciales)
  // Flag para evitar un refetch del realtime cuando el cambio lo generó el propio fichaje
  const skipNextRealtime = useRef(false)

  function handleFichaje(newRegistros: RegistroAsistencia[]) {
    skipNextRealtime.current = true
    setRegistros(newRegistros)
  }

  // Suscripción Realtime: actualiza si el admin modifica un registro
  useEffect(() => {
    const channel = supabase
      .channel('fichar-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'registros_asistencia',
          filter: `empleado_id=eq.${empleado.id}`,
        },
        async () => {
          if (skipNextRealtime.current) {
            skipNextRealtime.current = false
            return
          }
          const res = await fetch('/api/fichar')
          const data = await res.json()
          setRegistros(data.registros ?? [])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [empleado.id, supabase])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900 flex flex-col safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <p className="text-blue-200 text-xs uppercase tracking-wider">Bienvenido/a</p>
          <h1 className="text-white font-bold text-lg leading-tight">
            {empleado.nombre} {empleado.apellido}
          </h1>
          <p className="text-blue-300 text-xs">{empleado.sucursales?.nombre ?? '—'}</p>
        </div>
        <button
          onClick={cerrarSesion}
          className="text-blue-300 hover:text-white transition-colors text-sm"
          aria-label="Cerrar sesión"
        >
          Salir
        </button>
      </header>

      {/* Reloj */}
      <div className="py-8 px-5">
        <RelojTiempoReal />
      </div>

      {/* Botón de fichaje */}
      <div className="flex flex-col items-center px-5 pb-8">
        <BotonFichaje registros={registros} onFichaje={handleFichaje} />
      </div>

      {/* Historial del día */}
      <div className="flex-1 px-5 pb-8">
        <h2 className="text-blue-200 text-xs uppercase tracking-wider mb-3">
          Registros de hoy
        </h2>
        <HistorialDia registros={registros} esLibre={empleado.rol === 'administracion'} />
      </div>

      {/* Link al historial personal */}
      <div className="px-5 pb-8 text-center">
        <a
          href="/historial"
          className="text-blue-300 text-sm underline underline-offset-2 hover:text-white"
        >
          Ver historial completo
        </a>
      </div>
    </div>
  )
}
