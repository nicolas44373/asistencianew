'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { addMonths, subMonths } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { formatHora, formatFecha, formatMinutos, nombreMes } from '@/lib/utils/tiempo'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { redondearAlMultiploDe100 } from '@/lib/reglas/redondearMonto'
import { calcularInasistencias, calcularInasistenciasJustificadas } from '@/lib/reglas/calcularInasistencias'
import { construirResolverHorarios, type PeriodoSucursal } from '@/lib/reglas/resolverHorariosPorFecha'
import { agruparPorDia, calcularDiaLibre, calcularInasistenciasLibre, calcularInasistenciasJustificadasLibre } from '@/lib/reglas/calcularHorasLibres'
import { format } from 'date-fns-tz'
import type { RegistroAsistencia, HorarioSucursal, HorarioEmpleado, Empleado, Justificacion, Turno } from '@/lib/types/database'
import { parseJustificacionMotivo } from '@/lib/utils/justificaciones'

const TZ = 'America/Argentina/Buenos_Aires'

type EmpleadoFull = Empleado & { sucursales: { nombre: string } | null }

interface EstaticosData {
  empleado: EmpleadoFull
  historial: PeriodoSucursal[]
  horariosPorSucursal: Map<string, HorarioSucursal[]>
  esJuanBJustoPorSucursal: Map<string, boolean>
  horariosPersonales: HorarioEmpleado[]
  montoPresentismo: number
}

interface Props {
  empleadoId: string
  onClose: () => void
}

export function EmpleadoModal({ empleadoId, onClose }: Props) {
  const supabase = createClient()
  const [mesDate, setMesDate] = useState(new Date())

  // Datos estáticos: cargados una sola vez al abrir el modal
  const [estaticos, setEstaticos]             = useState<EstaticosData | null>(null)
  const [loadingEstaticos, setLoadingEstaticos] = useState(true)

  // Registros: se recargan solo cuando cambia el mes
  const [registros, setRegistros]               = useState<RegistroAsistencia[]>([])
  const [justificaciones, setJustificaciones]   = useState<Justificacion[]>([])
  const [loadingRegistros, setLoadingRegistros] = useState(true)

  const mes = format(mesDate, 'yyyy-MM', { timeZone: TZ })

  // ── Cargar datos estáticos (una vez por empleadoId) ───────────
  const fetchEstaticos = useCallback(async () => {
    setLoadingEstaticos(true)
    const { data: empleado } = await supabase
      .from('empleados').select('*, sucursales(nombre)').eq('id', empleadoId).single()

    if (!empleado) { setLoadingEstaticos(false); return }

    // Historial de sucursal: resuelve el horario vigente por fecha en vez de asumir la
    // sucursal actual del empleado para todo el mes (evita inasistencias falsas tras un traslado).
    const { data: historialRaw } = await supabase
      .from('empleado_sucursal_historial')
      .select('sucursal_id, fecha_desde, fecha_hasta')
      .eq('empleado_id', empleadoId)
      .order('fecha_desde', { ascending: true })

    const historial: PeriodoSucursal[] = (historialRaw ?? []).map(h => ({
      sucursalId: h.sucursal_id, fechaDesde: h.fecha_desde, fechaHasta: h.fecha_hasta,
    }))

    // Sucursales relevantes: todas las del historial + la actual (fallback si no hay historial)
    const sucursalIds = Array.from(new Set([
      ...historial.map(h => h.sucursalId),
      ...(empleado.sucursal_id ? [empleado.sucursal_id] : []),
    ]))

    const [{ data: horariosRaw }, { data: sucursalesRaw }, { data: horariosPersonales }, { data: config }] = await Promise.all([
      sucursalIds.length > 0
        ? supabase.from('horarios_sucursal').select('*').in('sucursal_id', sucursalIds)
        : Promise.resolve({ data: [] as HorarioSucursal[] }),
      sucursalIds.length > 0
        ? supabase.from('sucursales').select('id, nombre').in('id', sucursalIds)
        : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      supabase.from('horarios_empleado').select('*').eq('empleado_id', empleadoId),
      supabase.from('config_liquidacion')
        .select('monto_presentismo')
        .order('vigente_desde', { ascending: false })
        .limit(1).single(),
    ])

    const horariosPorSucursal = new Map<string, HorarioSucursal[]>()
    for (const h of (horariosRaw ?? []) as HorarioSucursal[]) {
      if (!horariosPorSucursal.has(h.sucursal_id)) horariosPorSucursal.set(h.sucursal_id, [])
      horariosPorSucursal.get(h.sucursal_id)!.push(h)
    }
    const esJuanBJustoPorSucursal = new Map<string, boolean>()
    for (const s of sucursalesRaw ?? []) {
      esJuanBJustoPorSucursal.set(s.id, s.nombre.toLowerCase().includes('juan b'))
    }

    setEstaticos({
      empleado: empleado as EmpleadoFull,
      historial,
      horariosPorSucursal,
      esJuanBJustoPorSucursal,
      horariosPersonales: (horariosPersonales ?? []) as HorarioEmpleado[],
      montoPresentismo: config ? Number(config.monto_presentismo) : 0,
    })
    setLoadingEstaticos(false)
  }, [empleadoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar registros del mes seleccionado ─────────────────────
  const fetchRegistros = useCallback(async () => {
    setLoadingRegistros(true)
    const [ano, mesNum] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const hasta = new Date(ano, mesNum, 0).toISOString().split('T')[0]

    const [{ data }, { data: justs }] = await Promise.all([
      supabase
        .from('registros_asistencia').select('*')
        .eq('empleado_id', empleadoId)
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('hora_entrada', { ascending: true }),
      supabase
        .from('justificaciones').select('*')
        .eq('empleado_id', empleadoId)
        .gte('fecha', desde).lte('fecha', hasta),
    ])

    setRegistros(data ?? [])
    setJustificaciones((justs ?? []) as Justificacion[])
    setLoadingRegistros(false)
  }, [empleadoId, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchEstaticos() }, [fetchEstaticos])
  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fmt = useCallback((n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n),
  [])

  const esLibre = estaticos?.empleado.rol === 'administracion'

  // ── Cálculos memoizados ───────────────────────────────────────
  // Resuelve el horario vigente por fecha usando el historial de sucursal del empleado,
  // en vez de asumir su sucursal actual para todo el mes (evita inasistencias falsas tras un traslado).
  const resolverHorarioDia = useMemo(() => {
    if (!estaticos) return () => []
    return construirResolverHorarios({
      historial: estaticos.historial,
      horariosPersonales: estaticos.horariosPersonales,
      horariosPorSucursal: estaticos.horariosPorSucursal,
      esJuanBJustoPorSucursal: estaticos.esJuanBJustoPorSucursal,
      sucursalIdFallback: estaticos.empleado.sucursal_id,
    })
  }, [estaticos])

  // Sucursal vigente en una fecha puntual (según el historial), para saber si ese día
  // corresponde a una sucursal sin turno único (ej. Juan B. Justo) al armar la lista de días.
  const esJuanBJustoEnFecha = useCallback((fecha: string): boolean => {
    if (!estaticos) return false
    const periodo = estaticos.historial.find(
      p => p.fechaDesde <= fecha && (p.fechaHasta === null || fecha <= p.fechaHasta)
    )
    const sucursalId = periodo?.sucursalId ?? estaticos.empleado.sucursal_id ?? null
    return sucursalId ? (estaticos.esJuanBJustoPorSucursal.get(sucursalId) ?? false) : false
  }, [estaticos])

  const fechaIngreso = useMemo(() =>
    estaticos ? new Date(estaticos.empleado.created_at).toLocaleDateString('sv-SE', { timeZone: TZ }) : undefined,
  [estaticos])

  const fechasInjustificadasExplicitas = useMemo(() => {
    if (!estaticos) return new Set<string>()
    const set = new Set<string>()
    justificaciones.filter(j => !j.justificada).forEach(j => {
      const parsed = parseJustificacionMotivo(j.motivo)
      const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
      set.add(key)
    })
    return set
  }, [estaticos, justificaciones])

  const fechasFeriadoOMediaJornada = useMemo(() => {
    if (!estaticos) return new Set<string>()
    const set = new Set<string>()
    justificaciones.filter(j => j.justificada).forEach(j => {
      const parsed = parseJustificacionMotivo(j.motivo)
      if (parsed.tipo === 'feriado' || parsed.tipo === 'media_jornada') {
        const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
        set.add(key)
      }
    })
    return set
  }, [estaticos, justificaciones])

  const fechasJust = useMemo(() => {
    if (!estaticos) return new Set<string>()
    const set = new Set<string>()
    justificaciones.filter(j => j.justificada).forEach(j => {
      const parsed = parseJustificacionMotivo(j.motivo)
      if (parsed.tipo !== 'feriado' && parsed.tipo !== 'media_jornada') {
        const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
        set.add(key)
      }
    })
    return set
  }, [estaticos, justificaciones])

  const inasistencias = useMemo(() =>
    !esLibre && estaticos
      ? calcularInasistencias(registros, resolverHorarioDia, mes, fechaIngreso, fechasInjustificadasExplicitas, fechasFeriadoOMediaJornada)
      : 0,
  [esLibre, estaticos, registros, resolverHorarioDia, mes, fechaIngreso, fechasInjustificadasExplicitas, fechasFeriadoOMediaJornada])

  const inasistenciasJustificadas = useMemo(() => {
    if (!estaticos) return 0
    if (esLibre) {
      return calcularInasistenciasJustificadasLibre(registros, mes, fechasJust, fechaIngreso, fechasFeriadoOMediaJornada)
    }
    return calcularInasistenciasJustificadas(registros, resolverHorarioDia, mes, fechasJust, fechaIngreso, fechasFeriadoOMediaJornada)
  }, [esLibre, estaticos, registros, resolverHorarioDia, mes, fechasJust, fechaIngreso, fechasFeriadoOMediaJornada])



  const registrosYInasistencias = useMemo(() => {
    if (esLibre || !estaticos) return []

    const items: Array<{
      id: string
      fecha: string
      turno: Turno
      registro: RegistroAsistencia | null
      estado: 'a_tiempo' | 'tardanza' | 'ausente_sin_justificar' | 'ausente_justificado' | 'ausente_feriado' | 'ausente_media_jornada' | 'ausente_injustificado' | 'sin_registrar'
      egreso_anticipado?: boolean
      minutos_extra?: number
      hora_entrada?: string | null
      hora_salida?: string | null
    }> = []

    const [year, month] = mes.split('-').map(Number)
    const hoyStr = format(new Date(), 'yyyy-MM-dd', { timeZone: TZ })
    const primerDiaStr = fechaIngreso
      ? (fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`)
      : `${mes}-01`

    const ultimoDiaEnMes = new Date(year, month, 0).getDate()

    for (let dia = ultimoDiaEnMes; dia >= 1; dia--) {
      const mm  = String(month).padStart(2, '0')
      const dd  = String(dia).padStart(2, '0')
      const fechaStr = `${year}-${mm}-${dd}`

      if (fechaStr < primerDiaStr) continue
      if (fechaStr > hoyStr) continue

      // Horario vigente para esta fecha puntual (según el historial de sucursal)
      const horariosDia = resolverHorarioDia(fechaStr)
      const tieneHorarioSemana = horariosDia.some(h => !h.es_sabado)
      const tieneHorarioSabado = horariosDia.some(h => h.es_sabado)

      const diaSemana = new Date(year, month - 1, dia).getDay()
      const esSabado = diaSemana === 6
      const esDiaLaboral =
        (diaSemana >= 1 && diaSemana <= 5 && tieneHorarioSemana) ||
        (esSabado && tieneHorarioSabado)

      const turnosEsperados = esDiaLaboral
        ? horariosDia.filter(h => h.es_sabado === esSabado).map(h => h.turno)
        : []

      const regsDia = registros.filter(r => r.fecha === fechaStr)
      const esJuanBJusto = esJuanBJustoEnFecha(fechaStr)
      const turnosAMostrar = (Array.from(new Set([
        ...turnosEsperados,
        ...regsDia.map(r => r.turno).filter((t): t is Turno => t !== null)
      ])) as Turno[]).filter(t => !(esJuanBJusto && t === 'unico'))

      const just = justificaciones.find(j => j.fecha === fechaStr)

      turnosAMostrar.forEach(turno => {
        const reg = regsDia.find(r => r.turno === turno) || null
        if (reg) {
          items.push({
            id: reg.id,
            fecha: fechaStr,
            turno,
            registro: reg,
            estado: reg.tarde ? 'tardanza' : 'a_tiempo',
            egreso_anticipado: reg.egreso_anticipado,
            minutos_extra: reg.minutos_extra,
            hora_entrada: reg.hora_entrada,
            hora_salida: reg.hora_salida,
          })
        } else {
          let estado: any = 'ausente_sin_justificar'
          if (fechaStr === hoyStr) {
            estado = 'sin_registrar'
          }
          if (just) {
            const parsed = parseJustificacionMotivo(just.motivo)
            const aplicaATurno = parsed.turno === 'all' || parsed.turno === turno
            if (aplicaATurno) {
              if (!just.justificada) {
                estado = 'ausente_injustificado'
              } else {
                if (parsed.tipo === 'feriado') {
                  estado = 'ausente_feriado'
                } else if (parsed.tipo === 'media_jornada') {
                  estado = 'ausente_media_jornada'
                } else {
                  estado = 'ausente_justificado'
                }
              }
            }
          }

          items.push({
            id: `ausente-${fechaStr}-${turno}`,
            fecha: fechaStr,
            turno,
            registro: null,
            estado,
          })
        }
      })
    }

    return items
  }, [esLibre, estaticos, registros, resolverHorarioDia, esJuanBJustoEnFecha, mes, fechaIngreso, justificaciones])

  const diasPorFecha = useMemo(() => {
    if (!esLibre || !estaticos) return []

    const items: Array<{
      fecha: string
      registros: RegistroAsistencia[]
      minutosTotal: number
      minutosExtra: number
      estaCompleto: boolean
      enCurso: boolean
      estadoAusencia?: 'ausente_sin_justificar' | 'ausente_justificado' | 'ausente_feriado' | 'ausente_media_jornada' | 'ausente_injustificado' | 'sin_registrar'
      tieneJustificacion: boolean
    }> = []

    const [year, month] = mes.split('-').map(Number)
    const hoyStr = format(new Date(), 'yyyy-MM-dd', { timeZone: TZ })
    const primerDiaStr = fechaIngreso
      ? (fechaIngreso > `${mes}-01` ? fechaIngreso : `${mes}-01`)
      : `${mes}-01`

    const ultimoDiaEnMes = new Date(year, month, 0).getDate()

    for (let dia = ultimoDiaEnMes; dia >= 1; dia--) {
      const mm  = String(month).padStart(2, '0')
      const dd  = String(dia).padStart(2, '0')
      const fechaStr = `${year}-${mm}-${dd}`

      if (fechaStr < primerDiaStr) continue
      if (fechaStr > hoyStr) continue

      const diaSemana = new Date(year, month - 1, dia).getDay()
      const esLaboralLibre = diaSemana >= 1 && diaSemana <= 6 // Lunes a Sábado

      const regsDia = registros.filter(r => r.fecha === fechaStr)
      const just = justificaciones.find(j => j.fecha === fechaStr)

      if (regsDia.length > 0) {
        const stats = calcularDiaLibre(regsDia, fechaStr)
        items.push({
          fecha: fechaStr,
          registros: regsDia,
          ...stats,
          tieneJustificacion: false,
        })
      } else if (esLaboralLibre || just) {
        let estadoAusencia: any = 'ausente_sin_justificar'
        if (fechaStr === hoyStr) {
          estadoAusencia = 'sin_registrar'
        }
        if (just) {
          if (!just.justificada) {
            estadoAusencia = 'ausente_injustificado'
          } else {
            const parsed = parseJustificacionMotivo(just.motivo)
            if (parsed.tipo === 'feriado') {
              estadoAusencia = 'ausente_feriado'
            } else if (parsed.tipo === 'media_jornada') {
              estadoAusencia = 'ausente_media_jornada'
            } else {
              estadoAusencia = 'ausente_justificado'
            }
          }
        }

        items.push({
          fecha: fechaStr,
          registros: [],
          minutosTotal: 0,
          minutosExtra: 0,
          estaCompleto: false,
          enCurso: false,
          estadoAusencia,
          tieneJustificacion: !!just,
        })
      }
    }

    return items
  }, [esLibre, estaticos, registros, mes, fechaIngreso, justificaciones])

  const inasistenciasLibre = useMemo(() =>
    esLibre ? calcularInasistenciasLibre(registros, mes, fechaIngreso, fechasInjustificadasExplicitas, fechasFeriadoOMediaJornada) : 0,
  [esLibre, registros, mes, fechaIngreso, fechasInjustificadasExplicitas, fechasFeriadoOMediaJornada])

  const statsLibre = useMemo(() => {
    const diasTrabajados  = diasPorFecha.filter(d => d.registros.some(r => r.hora_entrada)).length
    const diasCompletos   = diasPorFecha.filter(d => d.estaCompleto).length
    const minutosExtra    = diasPorFecha.reduce((acc, d) => acc + d.minutosExtra, 0)
    const valorHora       = (estaticos?.empleado.sueldo ?? 0) / 180
    const montoExtra      = parseFloat(((minutosExtra / 60) * valorHora).toFixed(2))
    return { diasTrabajados, diasCompletos, diasIncompletos: diasTrabajados - diasCompletos, minutosExtra, montoExtra }
  }, [diasPorFecha, estaticos])

  const resumen = useMemo(() => {
    if (!estaticos) return null
    if (esLibre) {
      const valorHora = (estaticos.empleado.sueldo ?? 0) / 180
      const minutosExtra = statsLibre.minutosExtra
      const montoExtra = parseFloat(((minutosExtra / 60) * valorHora).toFixed(2))
      const inas = inasistenciasLibre
      const inasJust = inasistenciasJustificadas
      const pierdePres = (inas - inasJust) > 0 || fechasInjustificadasExplicitas.size > 0
      const presentismo = pierdePres ? 0 : estaticos.montoPresentismo
      const totalLiquidarExacto = parseFloat((montoExtra + presentismo).toFixed(2))
      const totalLiquidar = redondearAlMultiploDe100(totalLiquidarExacto)

      return {
        diasTrabajados: statsLibre.diasTrabajados,
        tardanzas: 0,
        inasistencias: inas,
        inasistenciasJustificadas: inasJust,
        minutosExtraTotal: minutosExtra,
        horasExtraFormato: formatMinutos(minutosExtra),
        montoExtra,
        presentismo,
        totalLiquidar,
        totalLiquidarExacto,
      }
    }

    return calcularMes(
      registros,
      estaticos.empleado.sueldo ?? 0,
      estaticos.montoPresentismo,
      inasistencias,
      inasistenciasJustificadas,
      fechasInjustificadasExplicitas
    )
  }, [esLibre, estaticos, registros, inasistencias, inasistenciasJustificadas, fechasInjustificadasExplicitas, inasistenciasLibre, statsLibre])

  const loading = loadingEstaticos || loadingRegistros

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          {loadingEstaticos || !estaticos ? (
            <div className="space-y-1.5">
              <div className="h-6 w-44 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-60 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {estaticos.empleado.nombre} {estaticos.empleado.apellido}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="capitalize">{estaticos.empleado.rol}</span>
                {estaticos.empleado.sucursales && ` · ${estaticos.empleado.sucursales.nombre}`}
                {estaticos.empleado.dni && ` · DNI ${estaticos.empleado.dni}`}
              </p>
              {estaticos.empleado.sueldo != null && (
                <p className="text-sm text-slate-500">
                  Sueldo: {fmt(estaticos.empleado.sueldo)}
                  {' · '}
                  <span className={estaticos.empleado.activo ? 'text-green-600' : 'text-slate-400'}>
                    {estaticos.empleado.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </p>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="ml-4 shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-4">

          {/* Selector de mes */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <button
              onClick={() => setMesDate(d => subMonths(d, 1))}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm px-2 py-1"
            >
              ← Anterior
            </button>
            <span className="font-semibold text-slate-700 capitalize min-w-[140px] text-center">
              {nombreMes(mesDate)}
            </span>
            <button
              onClick={() => setMesDate(d => addMonths(d, 1))}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm px-2 py-1"
            >
              Siguiente →
            </button>
          </div>

          {loadingEstaticos ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !estaticos ? (
            <p className="text-center text-slate-400 py-10">No se pudo cargar la información</p>
          ) : esLibre ? (
            // ── Vista libre (administracion, lunes-sábado) ──────────
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Días" value={statsLibre.diasTrabajados} />
                <StatCard label="Días completos" value={statsLibre.diasCompletos} />
                <StatCard label="Días incompletos" value={statsLibre.diasIncompletos} danger={statsLibre.diasIncompletos > 0} />
                <StatCard label="Hs extra" value={formatMinutos(statsLibre.minutosExtra)} />
              </div>

              {resumen && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  <span className="text-slate-500">
                    Inasistencias:{' '}
                    <span className={resumen.inasistencias > 0 ? 'text-red-600 font-semibold' : 'text-slate-800 font-semibold'}>
                      {resumen.inasistencias}
                    </span>
                    {resumen.inasistenciasJustificadas > 0 && (
                      <span className="text-green-600 text-xs ml-1">({resumen.inasistenciasJustificadas} justif.)</span>
                    )}
                  </span>
                  <span className="text-slate-500">
                    Presentismo:{' '}
                    <span className={resumen.presentismo === 0 ? 'text-red-600 font-semibold' : 'text-slate-800 font-semibold'}>
                      {fmt(resumen.presentismo)}
                    </span>
                  </span>
                  <span className="text-slate-500">
                    Extras: <span className="text-slate-800 font-semibold">{fmt(resumen.montoExtra)}</span>
                  </span>
                  <span className="ml-auto text-right">
                    <span className="text-slate-500">Total: </span>
                    <span className="text-slate-900 font-bold text-base">{fmt(resumen.totalLiquidar)}</span>
                    {resumen.totalLiquidarExacto !== resumen.totalLiquidar && (
                      <span className="block text-xs text-slate-400">exacto: {fmt(resumen.totalLiquidarExacto)}</span>
                    )}
                  </span>
                </div>
              )}

              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Registros del mes
              </h3>

              {loadingRegistros ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : diasPorFecha.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Sin registros en este período</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {diasPorFecha.map(dia => {
                    const [y, m, d] = dia.fecha.split('-').map(Number)
                    const isSab = new Date(y, m - 1, d).getDay() === 6
                    return (
                      <div key={dia.fecha} className="py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-500">
                            {formatFecha(dia.fecha + 'T12:00:00')}
                          </span>
                          <div className="flex items-center gap-2">
                            {dia.registros.length > 0 ? (
                              <>
                                {dia.enCurso ? (
                                  <Chip text="En curso" color="blue" />
                                ) : dia.estaCompleto ? (
                                  <Chip text={formatMinutos(dia.minutosTotal)} color="green" />
                                ) : (
                                  <Chip text={`${formatMinutos(dia.minutosTotal)} / ${isSab ? '5h 30m' : '8h 30m'}`} color="orange" />
                                )}
                                {dia.minutosExtra > 0 && (
                                  <Chip text={`+${formatMinutos(dia.minutosExtra)}`} color="blue" />
                                )}
                              </>
                            ) : (
                              <>
                                {dia.estadoAusencia === 'ausente_feriado' && (
                                  <Chip text="Feriado" color="green" />
                                )}
                                {dia.estadoAusencia === 'ausente_media_jornada' && (
                                  <Chip text="Media Jornada" color="green" />
                                )}
                                {dia.estadoAusencia === 'ausente_justificado' && (
                                  <Chip text="Justificado" color="green" />
                                )}
                                {dia.estadoAusencia === 'ausente_injustificado' && (
                                  <Chip text="Injustificado" color="red" />
                                )}
                                {dia.estadoAusencia === 'ausente_sin_justificar' && (
                                  <Chip text="Ausente" color="orange" />
                                )}
                                {dia.estadoAusencia === 'sin_registrar' && (
                                  <Chip text="Sin registrar" color="orange" />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {dia.registros.length > 0 ? (
                          <div className="space-y-1 pl-1">
                            {dia.registros.map((r, i) => (
                              <div key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
                                <span className="text-xs text-slate-400 w-14 shrink-0">Bloque {i + 1}</span>
                                <span className="font-mono">
                                  {r.hora_entrada ? formatHora(r.hora_entrada) : '—'}
                                  <span className="text-slate-300 mx-1">→</span>
                                  {r.hora_salida ? formatHora(r.hora_salida) : <span className="text-slate-300">—</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          dia.tieneJustificacion && (
                            <p className="text-xs text-slate-500 pl-1 italic">
                              Motivo: {
                                (() => {
                                  const just = justificaciones.find(j => j.fecha === dia.fecha)
                                  if (!just) return ''
                                  const parsed = parseJustificacionMotivo(just.motivo)
                                  return parsed.texto || 'Sin especificar'
                                })()
                              }
                            </p>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            // ── Vista normal ─────────────────────────────────────────
            <>
              {resumen && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <StatCard label="Días" value={resumen.diasTrabajados} />
                    <StatCard label="Tardanzas" value={resumen.tardanzas} danger={resumen.tardanzas >= 3} />
                    <StatCard
                      label="Inasistencias"
                      value={resumen.inasistencias}
                      sub={resumen.inasistenciasJustificadas > 0 ? `${resumen.inasistenciasJustificadas} justif.` : undefined}
                      danger={resumen.inasistencias - resumen.inasistenciasJustificadas >= 1}
                    />
                    <StatCard label="Hs extra" value={resumen.horasExtraFormato} />
                  </div>

                  <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-slate-500">
                      Presentismo:{' '}
                      <span className={resumen.presentismo === 0 ? 'text-red-600 font-semibold' : 'text-slate-800 font-semibold'}>
                        {fmt(resumen.presentismo)}
                      </span>
                    </span>
                    <span className="text-slate-500">
                      Extras: <span className="text-slate-800 font-semibold">{fmt(resumen.montoExtra)}</span>
                    </span>
                    <span className="ml-auto text-right">
                      <span className="text-slate-500">Total: </span>
                      <span className="text-slate-900 font-bold text-base">{fmt(resumen.totalLiquidar)}</span>
                      {resumen.totalLiquidarExacto !== resumen.totalLiquidar && (
                        <span className="block text-xs text-slate-400">exacto: {fmt(resumen.totalLiquidarExacto)}</span>
                      )}
                    </span>
                  </div>
                </>
              )}

              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Registros del mes
              </h3>

              {loadingRegistros ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : registrosYInasistencias.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Sin registros ni inasistencias en este período</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {registrosYInasistencias.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-xs text-slate-400 w-16 shrink-0 font-medium">
                        {formatFecha(item.fecha + 'T12:00:00')}
                      </span>
                      <span className="text-xs text-slate-400 w-12 shrink-0 capitalize">
                        {item.turno ?? '—'}
                      </span>
                      <span className="font-mono text-sm text-slate-700">
                        {item.hora_entrada ? formatHora(item.hora_entrada) : '—'}
                        <span className="text-slate-300 mx-1">→</span>
                        {item.hora_salida ? formatHora(item.hora_salida) : <span className="text-slate-300">—</span>}
                      </span>
                      <div className="ml-auto flex gap-1 flex-wrap justify-end">
                        {item.estado === 'tardanza' && <Chip text="Tardanza" color="red" />}
                        {item.estado === 'a_tiempo' && <Chip text="A tiempo" color="green" />}
                        {item.estado === 'ausente_sin_justificar' && <Chip text="Ausente" color="orange" />}
                        {item.estado === 'sin_registrar' && <Chip text="Sin registrar" color="orange" />}
                        {item.estado === 'ausente_injustificado' && <Chip text="Injustificado" color="red" />}
                        {item.estado === 'ausente_justificado' && <Chip text="Justificado" color="green" />}
                        {item.estado === 'ausente_feriado' && <Chip text="Feriado" color="blue" />}
                        {item.estado === 'ausente_media_jornada' && <Chip text="Media Jornada" color="blue" />}
                        
                        {item.egreso_anticipado && <Chip text="Salida ant." color="orange" />}
                        {item.minutos_extra ? item.minutos_extra > 0 ? (
                          <Chip text={`+${formatMinutos(item.minutos_extra)}`} color="blue" />
                        ) : null : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, danger, sub }: { label: string; value: string | number; danger?: boolean; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${danger ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-green-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Chip({ text, color }: { text: string; color: 'red' | 'green' | 'blue' | 'orange' }) {
  const cls = {
    red:    'bg-red-100 text-red-700',
    green:  'bg-green-100 text-green-700',
    blue:   'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
  }[color]
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{text}</span>
}
