'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RegistroAsistencia, Sucursal, HorarioSucursal, Justificacion, HorarioEmpleado, Turno } from '@/lib/types/database'
import { formatHora, formatMinutos, fechaHoyLocal } from '@/lib/utils/tiempo'
import { EmpleadoModal } from '@/components/admin/EmpleadoModal'
import { parseJustificacionMotivo, serializeJustificacionMotivo, TipoJustificacion } from '@/lib/utils/justificaciones'

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
  horariosPersonales: HorarioEmpleado[]
  justificaciones: Justificacion[]
  fechaInicial: string
  filtros: { sucursal_id?: string; empleado_id?: string; desde?: string; hasta?: string }
  rangoActivo: boolean
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
  turno: string
}

interface RegistroNuevoForm {
  hora_entrada: string
  hora_salida: string
  motivo_edicion: string
  turno: string
}

interface RegistrandoState {
  empleado_id: string
  nombre: string
  tipo: 'ingreso' | 'salida'
  registroId?: string
  turno?: string
}

interface TurnoUnifForm {
  registroId?: string
  hora_entrada: string
  hora_salida: string
}

interface RegistrarUnifState {
  empleado_id: string
  nombre: string
  fecha: string
  manana: TurnoUnifForm
  tarde: TurnoUnifForm
}

function horaActualLocal(): string {
  return new Date().toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function AsistenciaClient({ registros, sucursales, empleados, horarios, horariosPersonales, justificaciones, fechaInicial, filtros, rangoActivo }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [fecha, setFecha]         = useState(fechaInicial)
  const [sucursalId, setSucursal] = useState(filtros.sucursal_id ?? '')
  const [empleadoId, setEmpleado] = useState(filtros.empleado_id ?? '')
  const [desde, setDesde]         = useState(filtros.desde ?? '')
  const [hasta, setHasta]         = useState(filtros.hasta ?? '')
  const [filtroError, setFiltroError] = useState<string | null>(null)
  const [editando, setEditando]   = useState<RegistroConEmp | null>(null)
  const [editForm, setEditForm]   = useState<EditForm>({ hora_entrada: '', hora_salida: '', motivo_edicion: '', turno: 'mañana' })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null)

  // Estado para justificaciones
  const [justificando, setJustificando]   = useState<JustificandoState | null>(null)
  const [justForm, setJustForm]           = useState<{ justificada: boolean; tipo: TipoJustificacion; turno: Turno | 'all'; motivo: string }>({ justificada: true, tipo: 'regular', turno: 'all', motivo: '' })
  const [justLoading, setJustLoading]     = useState(false)
  const [justError, setJustError]         = useState<string | null>(null)

  const esJuanBJusto = useMemo(() => {
    if (!justificando) return false
    const emp = empleados.find(e => e.id === justificando.empleado_id)
    if (!emp) return false
    const sucursal = sucursales.find(s => s.id === emp.sucursal_id)
    return sucursal?.nombre.toLowerCase().includes('juan b') ?? false
  }, [justificando, empleados, sucursales])

  // Mapa rápido empleado_id → justificacion (para la fecha seleccionada)
  const justMap = useMemo(() => {
    const m = new Map<string, Justificacion>()
    for (const j of justificaciones) m.set(j.empleado_id, j)
    return m
  }, [justificaciones])

  // Estado para registro manual
  const [registrando, setRegistrando] = useState<RegistrandoState | null>(null)
  const [regForm, setRegForm]         = useState<RegistroNuevoForm>({ hora_entrada: '', hora_salida: '', motivo_edicion: '', turno: 'mañana' })
  const [regLoading, setRegLoading]   = useState(false)
  const [regError, setRegError]       = useState<string | null>(null)

  // Estado para registro manual unificado (mañana + tarde en una sola operación)
  const [registrandoUnif, setRegistrandoUnif] = useState<RegistrarUnifState | null>(null)
  const [unifMotivo, setUnifMotivo]           = useState('')
  const [unifLoading, setUnifLoading]         = useState(false)
  const [unifError, setUnifError]             = useState<string | null>(null)

  // Turnos disponibles para el empleado seleccionado
  const turnosDisponibles = useMemo(() => {
    if (!registrando && !editando) return ['mañana', 'tarde', 'unico']
    const empId = registrando?.empleado_id || editando?.empleado_id
    const emp = empleados.find(e => e.id === empId)
    if (!emp) return ['mañana', 'tarde', 'unico']

    const sucursal = sucursales.find(s => s.id === emp.sucursal_id)
    const esJuanBJusto = sucursal?.nombre.toLowerCase().includes('juan b')

    // Buscar horarios configurados para este empleado o sucursal
    const personalTurnos = horariosPersonales.filter(h => h.empleado_id === emp.id).map(h => h.turno)
    if (personalTurnos.length > 0) {
      const uniquePersonal = Array.from(new Set(personalTurnos))
      return esJuanBJusto ? uniquePersonal.filter(t => t !== 'unico') : uniquePersonal
    }

    const sucursalTurnos = horarios.filter(h => h.sucursal_id === emp.sucursal_id).map(h => h.turno)
    if (sucursalTurnos.length > 0) {
      const uniqueSucursal = Array.from(new Set(sucursalTurnos))
      return esJuanBJusto ? uniqueSucursal.filter(t => t !== 'unico') : uniqueSucursal
    }

    return esJuanBJusto ? ['mañana', 'tarde'] : ['mañana', 'tarde', 'unico']
  }, [registrando, editando, empleados, horarios, horariosPersonales, sucursales])

  // Ajustar el turno seleccionado si no está en la lista de disponibles
  useEffect(() => {
    if (registrando && !turnosDisponibles.includes(regForm.turno)) {
      setRegForm(f => ({ ...f, turno: turnosDisponibles[0] || 'mañana' }))
    }
  }, [registrando, turnosDisponibles, regForm.turno])

  useEffect(() => {
    if (editando && !turnosDisponibles.includes(editForm.turno)) {
      setEditForm(f => ({ ...f, turno: turnosDisponibles[0] || 'mañana' }))
    }
  }, [editando, turnosDisponibles, editForm.turno])

  // Precalcula y unifica filas para cada turno esperado de los empleados (solo modo día)
  const rowsToRender = useMemo(() => {
    if (rangoActivo) return []
    const rows: Array<{
      emp: typeof empleados[0]
      sucursalNombre: string
      turno: Turno
      registro: RegistroConEmp | null
      just: Justificacion | null
      isFirstOfEmployee: boolean
      rowSpan: number
      turnosAMostrar: Turno[]
    }> = []

    const [y, m, d]  = fechaInicial.split('-').map(Number)
    const diaSemana  = new Date(y, m - 1, d).getDay() // 0=Dom … 6=Sab
    const esSabado   = diaSemana === 6

    for (const emp of empleados) {
      if (empleadoId && emp.id !== empleadoId) continue
      if (sucursalId && emp.sucursal_id !== sucursalId) continue

      const sucursalNombre = sucursales.find(s => s.id === emp.sucursal_id)?.nombre ?? '—'
      const esJuanBJusto = sucursalNombre.toLowerCase().includes('juan b')
      const just = justMap.get(emp.id) ?? null

      // Horario personal tiene prioridad
      const empPersonales = horariosPersonales.filter(h => h.empleado_id === emp.id && h.es_sabado === esSabado)
      const horariosEmp = empPersonales.length > 0
        ? empPersonales
        : horarios.filter(h => h.sucursal_id === emp.sucursal_id && h.es_sabado === esSabado)

      const turnosProgramados = horariosEmp.map(h => h.turno)
      const regsEmp = registros.filter(r => r.empleado_id === emp.id)
      
      // Combinar turnos programados y los turnos que realmente tienen registros
      const turnosAMostrar = Array.from(new Set([
        ...turnosProgramados,
        ...regsEmp.map(r => r.turno).filter((t): t is Turno => t !== null)
      ])).filter(t => !(esJuanBJusto && t === 'unico'))

      if (turnosAMostrar.length === 0) continue

      turnosAMostrar.forEach((turno, index) => {
        const registro = regsEmp.find(r => r.turno === turno) ?? null
        rows.push({
          emp,
          sucursalNombre,
          turno,
          registro,
          just,
          isFirstOfEmployee: index === 0,
          rowSpan: turnosAMostrar.length,
          turnosAMostrar,
        })
      })
    }

    return rows
  }, [rangoActivo, fechaInicial, sucursalId, empleadoId, registros, empleados, horarios, horariosPersonales, sucursales, justMap])

  function aplicarFiltros() {
    setFiltroError(null)

    const rangoParcial = (desde && !hasta) || (!desde && hasta)
    if (rangoParcial) {
      setFiltroError('Completá ambas fechas ("Desde" y "Hasta") para filtrar por rango')
      return
    }

    if (desde && hasta) {
      if (desde > hasta) {
        setFiltroError('La fecha "Desde" no puede ser posterior a "Hasta"')
        return
      }
      if (!empleadoId) {
        setFiltroError('Elegí un empleado para filtrar por rango de fechas')
        return
      }
      const params = new URLSearchParams({ desde, hasta, empleado_id: empleadoId })
      startTransition(() => router.push(`/asistencia?${params}`))
      return
    }

    const params = new URLSearchParams({ fecha })
    if (sucursalId) params.set('sucursal_id', sucursalId)
    if (empleadoId) params.set('empleado_id', empleadoId)
    startTransition(() => router.push(`/asistencia?${params}`))
  }

  function limpiarFiltros() {
    setDesde('')
    setHasta('')
    setSucursal('')
    setEmpleado('')
    setFiltroError(null)
    setFecha(fechaHoyLocal())
    startTransition(() => router.push('/asistencia'))
  }

  function abrirEdicion(r: RegistroConEmp) {
    setEditando(r)
    setEditForm({
      hora_entrada: r.hora_entrada ? formatHoraInput(r.hora_entrada) : '',
      hora_salida:  r.hora_salida  ? formatHoraInput(r.hora_salida)  : '',
      motivo_edicion: '',
      turno: r.turno ?? 'mañana',
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
          turno: editForm.turno,
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

  async function eliminarRegistro(id: string) {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro de asistencia?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/asistencia/${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error'); return }
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  function abrirJustificacion(emp: { id: string; nombre: string; apellido: string }, turno?: Turno) {
    const existente = justMap.get(emp.id) ?? null
    const parsed = parseJustificacionMotivo(existente?.motivo ?? '')
    setJustificando({ empleado_id: emp.id, nombre: `${emp.apellido}, ${emp.nombre}`, existente })
    setJustForm({
      justificada: existente?.justificada ?? true,
      tipo: existente ? parsed.tipo : 'regular',
      turno: (existente ? parsed.turno : (turno ?? 'all')) as Turno | 'all',
      motivo: existente ? parsed.texto : '',
    })
    setJustError(null)
  }

  async function guardarJustificacion(e: React.FormEvent) {
    e.preventDefault()
    if (!justificando) return
    setJustLoading(true)
    setJustError(null)
    try {
      const dbMotivo = serializeJustificacionMotivo(justForm.tipo, justForm.motivo, justForm.turno)
      const res = await fetch('/api/admin/justificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleado_id: justificando.empleado_id,
          fecha,
          justificada: justForm.justificada,
          motivo: dbMotivo || null,
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
      justificando && setJustificando(null)
      router.refresh()
    } catch {
      setJustError('Error de conexión')
    } finally {
      setJustLoading(false)
    }
  }

  function abrirRegistroIngreso(emp: { id: string; nombre: string; apellido: string }, turno: string = 'mañana') {
    setRegistrando({ empleado_id: emp.id, nombre: `${emp.apellido}, ${emp.nombre}`, tipo: 'ingreso' })
    setRegForm({ hora_entrada: horaActualLocal(), hora_salida: '', motivo_edicion: '', turno })
    setRegError(null)
  }

  function abrirRegistroSalida(r: RegistroConEmp) {
    const nombre = r.empleados ? `${r.empleados.apellido}, ${r.empleados.nombre}` : '—'
    setRegistrando({ empleado_id: r.empleado_id, nombre, tipo: 'salida', registroId: r.id, turno: r.turno ?? undefined })
    setRegForm({ hora_entrada: r.hora_entrada ? formatHoraInput(r.hora_entrada) : '', hora_salida: horaActualLocal(), motivo_edicion: '', turno: r.turno ?? 'mañana' })
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
            turno:          regForm.turno,
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

  function abrirRegistroUnificado(emp: { id: string; nombre: string; apellido: string }) {
    const regsEmp = registros.filter(r => r.empleado_id === emp.id)
    const mananaReg = regsEmp.find(r => r.turno === 'mañana') ?? null
    const tardeReg  = regsEmp.find(r => r.turno === 'tarde')  ?? null

    setRegistrandoUnif({
      empleado_id: emp.id,
      nombre: `${emp.apellido}, ${emp.nombre}`,
      fecha,
      manana: {
        registroId:   mananaReg?.id,
        hora_entrada: mananaReg?.hora_entrada ? formatHoraInput(mananaReg.hora_entrada) : '',
        hora_salida:  mananaReg?.hora_salida  ? formatHoraInput(mananaReg.hora_salida)  : '',
      },
      tarde: {
        registroId:   tardeReg?.id,
        hora_entrada: tardeReg?.hora_entrada ? formatHoraInput(tardeReg.hora_entrada) : '',
        hora_salida:  tardeReg?.hora_salida  ? formatHoraInput(tardeReg.hora_salida)  : '',
      },
    })
    setUnifMotivo('')
    setUnifError(null)
  }

  async function guardarRegistroUnificado(e: React.FormEvent) {
    e.preventDefault()
    if (!registrandoUnif) return

    const { manana, tarde } = registrandoUnif
    const tareas: Array<{ turno: 'mañana' | 'tarde'; data: TurnoUnifForm }> = []

    if (manana.hora_salida.trim() && !manana.hora_entrada.trim()) {
      setUnifError('Turno mañana: si cargás la hora de salida, la hora de entrada es obligatoria')
      return
    }
    if (tarde.hora_salida.trim() && !tarde.hora_entrada.trim()) {
      setUnifError('Turno tarde: si cargás la hora de salida, la hora de entrada es obligatoria')
      return
    }
    if (manana.hora_entrada.trim()) tareas.push({ turno: 'mañana', data: manana })
    if (tarde.hora_entrada.trim())  tareas.push({ turno: 'tarde',  data: tarde })

    if (tareas.length === 0) {
      setUnifError('Completá al menos un turno (mañana o tarde)')
      return
    }
    if (!unifMotivo.trim()) {
      setUnifError('El motivo es obligatorio')
      return
    }

    setUnifLoading(true)
    setUnifError(null)

    try {
      for (const t of tareas) {
        const url    = t.data.registroId ? `/api/admin/asistencia/${t.data.registroId}` : '/api/admin/asistencia'
        const method = t.data.registroId ? 'PATCH' : 'POST'
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empleado_id:    registrandoUnif.empleado_id,
            fecha:          registrandoUnif.fecha,
            hora_entrada:   t.data.hora_entrada,
            hora_salida:    t.data.hora_salida || null,
            motivo_edicion: unifMotivo,
            turno:          t.turno,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          setUnifError(`Turno ${t.turno}: ${json.error ?? 'Error'}`)
          return
        }
      }

      setRegistrandoUnif(null)
      router.refresh()
    } catch {
      setUnifError('Error de conexión')
    } finally {
      setUnifLoading(false)
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              disabled={rangoActivo}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal</label>
            <select
              value={sucursalId}
              onChange={e => setSucursal(e.target.value)}
              disabled={Boolean(desde && hasta)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">Todas</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Empleado {Boolean(desde && hasta) && <span className="text-red-500">*</span>}
            </label>
            <select
              value={empleadoId}
              onChange={e => setEmpleado(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {empleados.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.apellido}, {emp.nombre}</option>
              ))}
            </select>
          </div>
          <button
            onClick={aplicarFiltros}
            disabled={isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? 'Buscando...' : 'Buscar'}
          </button>
          {(rangoActivo || sucursalId || empleadoId || desde || hasta) && (
            <button
              onClick={limpiarFiltros}
              disabled={isPending}
              className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >
              Limpiar
            </button>
          )}
        </div>
        {filtroError && (
          <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 mt-3">{filtroError}</p>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          {rangoActivo ? (
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Fecha</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Turno</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Entrada</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Salida</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Estado</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Extras</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registros.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    Sin registros para este período
                  </td>
                </tr>
              )}
              {registros.map(registro => (
                <tr key={registro.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-700 font-mono">{registro.fecha}</td>
                  <td className="px-6 py-4 text-slate-600 capitalize font-medium">{registro.turno ?? '—'}</td>
                  <td className="px-6 py-4 font-mono text-slate-700">
                    {registro.hora_entrada ? formatHora(registro.hora_entrada) : '—'}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-700">
                    {registro.hora_salida ? formatHora(registro.hora_salida) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {registro.tarde ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tardanza</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">A tiempo</span>
                      )}
                      {registro.egreso_anticipado && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Retiro ant.</span>
                      )}
                      {registro.salida_autocompletada && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">Salida autocompletada</span>
                      )}
                      {registro.editado_por && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">Editado</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {registro.minutos_extra > 0 ? formatMinutos(registro.minutos_extra) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 items-center flex-wrap">
                      <button
                        onClick={() => abrirEdicion(registro)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminarRegistro(registro.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          ) : (
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Registro</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Turno</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Entrada</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Salida</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Estado</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Extras</th>
                <th className="text-left px-6 py-3 text-slate-500 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rowsToRender.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    Sin registros para este filtro
                  </td>
                </tr>
              )}
              {rowsToRender.map(({ emp, sucursalNombre, turno, registro, just, isFirstOfEmployee, rowSpan, turnosAMostrar }, index) => {
                const uniqueKey = `${emp.id}-${turno}`
                const tieneRegistroUnificado = turnosAMostrar.includes('mañana') || turnosAMostrar.includes('tarde')
                const esTurnoUnificable = turno === 'mañana' || turno === 'tarde'
                return (
                  <tr key={uniqueKey} className={`hover:bg-slate-50/50 ${isFirstOfEmployee && index > 0 ? 'border-t border-slate-200' : ''}`}>
                    {isFirstOfEmployee && (
                      <>
                        <td
                          rowSpan={rowSpan}
                          className="px-6 py-4 font-medium text-blue-700 cursor-pointer hover:underline align-middle"
                          onClick={() => setSelectedEmpleadoId(emp.id)}
                        >
                          {emp.apellido}, {emp.nombre}
                        </td>
                        <td rowSpan={rowSpan} className="px-6 py-4 text-slate-600 align-middle">
                          {sucursalNombre}
                        </td>
                        <td rowSpan={rowSpan} className="px-6 py-4 align-middle">
                          {tieneRegistroUnificado ? (
                            <button
                              onClick={() => abrirRegistroUnificado(emp)}
                              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                            >
                              Registrar
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-slate-600 capitalize font-medium">{turno}</td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {registro?.hora_entrada ? formatHora(registro.hora_entrada) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {registro?.hora_salida ? formatHora(registro.hora_salida) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {registro ? (
                          <>
                            {registro.tarde ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tardanza</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">A tiempo</span>
                            )}
                            {registro.egreso_anticipado && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Retiro ant.</span>
                            )}
                            {registro.salida_autocompletada && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">Salida autocompletada</span>
                            )}
                            {registro.editado_por && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">Editado</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                              Ausente
                            </span>
                            {(() => {
                              if (!just) {
                                return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">Sin justificar</span>
                              }
                              const parsed = parseJustificacionMotivo(just.motivo)
                              const aplicaATurno = parsed.turno === 'all' || parsed.turno === turno
                              if (!aplicaATurno) {
                                return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">Sin justificar</span>
                              }
                              if (!just.justificada) {
                                return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Injustificada</span>
                              }
                              if (parsed.tipo === 'feriado') {
                                return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 font-semibold">Feriado</span>
                              }
                              if (parsed.tipo === 'media_jornada') {
                                return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 font-semibold">Media Jornada</span>
                              }
                              return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Justificada</span>
                            })()}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {registro && registro.minutos_extra > 0 ? formatMinutos(registro.minutos_extra) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 items-center flex-wrap">
                        {registro ? (
                          <>
                            <button
                              onClick={() => abrirEdicion(registro)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Editar
                            </button>
                            {registro.hora_entrada && !registro.hora_salida && (
                              <button
                                onClick={() => abrirRegistroSalida(registro)}
                                className="text-emerald-600 hover:text-emerald-800 text-sm font-medium"
                              >
                                Salida
                              </button>
                            )}
                            <button
                              onClick={() => eliminarRegistro(registro.id)}
                              className="text-red-500 hover:text-red-700 text-sm font-medium"
                            >
                              Eliminar
                            </button>
                          </>
                        ) : (
                          <>
                            {!esTurnoUnificable && (
                              <button
                                onClick={() => abrirRegistroIngreso(emp, turno)}
                                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                              >
                                Registrar
                              </button>
                            )}
                            <button
                              onClick={() => abrirJustificacion(emp, turno)}
                              className="text-violet-600 hover:text-violet-800 text-sm font-medium"
                            >
                              {just ? 'Ver Justif.' : 'Justificar'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          )}
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
            <h2 className="text-lg font-bold text-slate-800 mb-1">Justificación de inasistencia</h2>
            <p className="text-slate-500 text-sm mb-4">{justificando.nombre} — {fecha}</p>

            <form onSubmit={guardarJustificacion} className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-700 mb-2">Estado de inasistencia</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setJustForm(f => ({ ...f, justificada: true, tipo: 'regular' }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all text-center ${
                      justForm.justificada && justForm.tipo === 'regular'
                        ? 'bg-green-50 border-green-200 text-green-700 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Justificada (Común)
                  </button>
                  <button
                    type="button"
                    onClick={() => setJustForm(f => ({ ...f, justificada: false, tipo: 'regular' }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all text-center ${
                      !justForm.justificada
                        ? 'bg-red-50 border-red-200 text-red-700 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Injustificada
                  </button>
                  <button
                    type="button"
                    onClick={() => setJustForm(f => ({ ...f, justificada: true, tipo: 'feriado' }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all text-center ${
                      justForm.justificada && justForm.tipo === 'feriado'
                        ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Feriado
                  </button>
                  <button
                    type="button"
                    onClick={() => setJustForm(f => ({ ...f, justificada: true, tipo: 'media_jornada' }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all text-center ${
                      justForm.justificada && justForm.tipo === 'media_jornada'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Media Jornada
                  </button>
                </div>
                
                <div className="text-xs text-slate-505 bg-slate-50 rounded-lg p-2.5">
                  {justForm.justificada && justForm.tipo === 'regular' && (
                    <span>No pierde presentismo. Cuenta como inasistencia justificada.</span>
                  )}
                  {!justForm.justificada && (
                    <span>Pierde presentismo. Cuenta como inasistencia injustificada.</span>
                  )}
                  {justForm.justificada && justForm.tipo === 'feriado' && (
                    <span>No pierde presentismo. No suma inasistencias en el mes.</span>
                  )}
                  {justForm.justificada && justForm.tipo === 'media_jornada' && (
                    <span>No pierde presentismo. No suma inasistencias en el mes.</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Turno a Justificar
                </label>
                <select
                  value={justForm.turno}
                  onChange={e => setJustForm(f => ({ ...f, turno: e.target.value as Turno | 'all' }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 capitalize"
                >
                  <option value="all">Día completo</option>
                  <option value="mañana">Turno Mañana</option>
                  <option value="tarde">Turno Tarde</option>
                  {!esJuanBJusto && <option value="unico">Turno Único</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo <span className="text-slate-400">(opcional)</span>
                </label>
                <textarea
                  value={justForm.motivo}
                  onChange={e => setJustForm(f => ({ ...f, motivo: e.target.value }))}
                  rows={2}
                  placeholder="Ej: turno médico, feriado nacional, etc."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
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
                  className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
            <h2 className="text-lg font-bold text-slate-800 mb-1">
              {registrando.tipo === 'ingreso' ? 'Registrar asistencia' : 'Registrar salida'}
            </h2>
            <p className="text-slate-500 text-sm mb-4">
              {registrando.nombre} — {fecha}
            </p>

            <form onSubmit={guardarRegistro} className="space-y-4">
              {registrando.tipo === 'ingreso' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Turno <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={regForm.turno}
                      onChange={e => setRegForm(f => ({ ...f, turno: e.target.value }))}
                      required
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 capitalize"
                    >
                      {turnosDisponibles.map(t => (
                        <option key={t} value={t}>
                          {t === 'unico' ? 'Único' : t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Hora de entrada <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={regForm.hora_entrada}
                      onChange={e => setRegForm(f => ({ ...f, hora_entrada: e.target.value }))}
                      required
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hora de salida {registrando.tipo === 'salida' && <span className="text-red-500">*</span>}
                  {registrando.tipo === 'ingreso' && <span className="text-slate-400">(opcional)</span>}
                </label>
                <input
                  type="time"
                  value={regForm.hora_salida}
                  onChange={e => setRegForm(f => ({ ...f, hora_salida: e.target.value }))}
                  required={registrando.tipo === 'salida'}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={regForm.motivo_edicion}
                  onChange={e => setRegForm(f => ({ ...f, motivo_edicion: e.target.value }))}
                  rows={2}
                  required
                  placeholder="Ej: sin celular, registro manual..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {regError && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{regError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRegistrando(null)}
                  className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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

      {/* Modal registro manual unificado (mañana + tarde) */}
      {registrandoUnif && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Registrar asistencia</h2>
            <p className="text-slate-500 text-sm mb-4">
              {registrandoUnif.nombre} — {registrandoUnif.fecha}
            </p>

            <form onSubmit={guardarRegistroUnificado} className="space-y-4">
              <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-700">Turno mañana</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Entrada</label>
                    <input
                      type="time"
                      value={registrandoUnif.manana.hora_entrada}
                      onChange={e => setRegistrandoUnif(s => s && ({ ...s, manana: { ...s.manana, hora_entrada: e.target.value } }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Salida</label>
                    <input
                      type="time"
                      value={registrandoUnif.manana.hora_salida}
                      onChange={e => setRegistrandoUnif(s => s && ({ ...s, manana: { ...s.manana, hora_salida: e.target.value } }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-700">Turno tarde</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Entrada</label>
                    <input
                      type="time"
                      value={registrandoUnif.tarde.hora_entrada}
                      onChange={e => setRegistrandoUnif(s => s && ({ ...s, tarde: { ...s.tarde, hora_entrada: e.target.value } }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Salida</label>
                    <input
                      type="time"
                      value={registrandoUnif.tarde.hora_salida}
                      onChange={e => setRegistrandoUnif(s => s && ({ ...s, tarde: { ...s.tarde, hora_salida: e.target.value } }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Dejá un turno vacío si el empleado no trabajó ese turno ese día.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={unifMotivo}
                  onChange={e => setUnifMotivo(e.target.value)}
                  rows={2}
                  required
                  placeholder="Ej: sin celular, registro manual..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {unifError && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{unifError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRegistrandoUnif(null)}
                  className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={unifLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {unifLoading ? 'Guardando...' : 'Guardar'}
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
            <h2 className="text-lg font-bold text-slate-800 mb-1">Editar registro</h2>
            <p className="text-slate-500 text-sm mb-4">
              {editando.empleados?.nombre} — {editando.fecha}
            </p>

            <form onSubmit={guardarEdicion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Turno</label>
                <select
                  value={editForm.turno}
                  onChange={e => setEditForm(f => ({ ...f, turno: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                >
                  {turnosDisponibles.map(t => (
                    <option key={t} value={t}>
                      {t === 'unico' ? 'Único' : t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hora entrada</label>
                <input
                  type="time"
                  value={editForm.hora_entrada}
                  onChange={e => setEditForm(f => ({ ...f, hora_entrada: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hora salida</label>
                <input
                  type="time"
                  value={editForm.hora_salida}
                  onChange={e => setEditForm(f => ({ ...f, hora_salida: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo de edición <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={editForm.motivo_edicion}
                  onChange={e => setEditForm(f => ({ ...f, motivo_edicion: e.target.value }))}
                  rows={2}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                  className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
