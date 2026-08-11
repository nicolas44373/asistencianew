import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias, calcularInasistenciasJustificadas } from '@/lib/reglas/calcularInasistencias'
import { calcularInasistenciasLibre, calcularInasistenciasJustificadasLibre } from '@/lib/reglas/calcularHorasLibres'
import { construirResolverHorarios, type PeriodoSucursal } from '@/lib/reglas/resolverHorariosPorFecha'
import { parseJustificacionMotivo } from '@/lib/utils/justificaciones'
import type { HorarioSucursal, HorarioEmpleado, RegistroAsistencia } from '@/lib/types/database'

const TZ = 'America/Argentina/Buenos_Aires'

export interface ResumenEmpleadoPeriodo {
  empleadoId: string
  nombre: string
  apellido: string
  dni: string | null
  sucursalId: string | null
  sucursalNombre: string
  rol: string
  sueldo: number
  diasTrabajados: number
  tardanzas: number
  inasistencias: number
  inasistenciasJustificadas: number
  minutosExtraTotal: number
  horasExtraFormato: string
  montoExtra: number
  presentismo: number
  totalLiquidar: number
  totalLiquidarExacto: number
}

/**
 * Calcula el resumen de liquidación mensual (días trabajados, tardanzas, inasistencias,
 * horas extra y monto a pagar) para todos los empleados activos, opcionalmente filtrado
 * por sucursal. Centraliza la lógica que hoy usan tanto el export a Excel como el cierre
 * automático mensual, para no mantenerla duplicada en dos lugares.
 *
 * `supabase` puede ser un cliente con sesión de usuario (RLS) o el admin client (service
 * role, sin sesión) — se usa este último desde el cron de cierre automático.
 */
export async function calcularResumenesPeriodo(
  supabase: SupabaseClient,
  mes: string,
  sucursalId?: string | null,
  empleadoId?: string | null
): Promise<ResumenEmpleadoPeriodo[]> {
  const [ano, mesNum] = mes.split('-').map(Number)
  const desde = `${mes}-01`
  const hasta = new Date(ano, mesNum, 0).toISOString().split('T')[0]

  let empQuery = supabase.from('empleados').select('*, sucursales(id, nombre)').eq('activo', true).neq('rol', 'admin').order('apellido')
  if (sucursalId) empQuery = empQuery.eq('sucursal_id', sucursalId)
  if (empleadoId) empQuery = empQuery.eq('id', empleadoId)

  const [
    { data: empleados },
    { data: registros },
    { data: config },
    { data: horariosSuc },
    { data: horariosEmp },
    { data: justificaciones },
    { data: sucursales },
    { data: historialSucursal },
  ] = await Promise.all([
    empQuery,
    supabase.from('registros_asistencia').select('empleado_id, fecha, hora_entrada, tarde, minutos_extra, turno').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('config_liquidacion').select('monto_presentismo').lte('vigente_desde', hasta).order('vigente_desde', { ascending: false }).limit(1).single(),
    supabase.from('horarios_sucursal').select('*'),
    supabase.from('horarios_empleado').select('*'),
    supabase.from('justificaciones').select('empleado_id, fecha, justificada, motivo').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('sucursales').select('id, nombre'),
    supabase.from('empleado_sucursal_historial').select('empleado_id, sucursal_id, fecha_desde, fecha_hasta'),
  ])

  const montoPresentismo = config ? Number(config.monto_presentismo) : 0

  const horPorSuc = new Map<string, HorarioSucursal[]>()
  for (const h of (horariosSuc ?? []) as HorarioSucursal[]) {
    if (!horPorSuc.has(h.sucursal_id)) horPorSuc.set(h.sucursal_id, [])
    horPorSuc.get(h.sucursal_id)!.push(h)
  }
  const horPorEmp = new Map<string, HorarioEmpleado[]>()
  for (const h of (horariosEmp ?? []) as HorarioEmpleado[]) {
    if (!horPorEmp.has(h.empleado_id)) horPorEmp.set(h.empleado_id, [])
    horPorEmp.get(h.empleado_id)!.push(h)
  }
  const esJuanBJustoPorSucursal = new Map<string, boolean>()
  for (const s of sucursales ?? []) {
    esJuanBJustoPorSucursal.set(s.id, s.nombre.toLowerCase().includes('juan b'))
  }
  const historialPorEmp = new Map<string, PeriodoSucursal[]>()
  for (const h of historialSucursal ?? []) {
    if (!historialPorEmp.has(h.empleado_id)) historialPorEmp.set(h.empleado_id, [])
    historialPorEmp.get(h.empleado_id)!.push({ sucursalId: h.sucursal_id, fechaDesde: h.fecha_desde, fechaHasta: h.fecha_hasta })
  }

  return (empleados ?? []).map(emp => {
    const regs    = ((registros ?? []) as RegistroAsistencia[]).filter(r => r.empleado_id === emp.id)
    const sueldo  = Number(emp.sueldo ?? 0)
    const pers    = horPorEmp.get(emp.id) ?? []
    const sucursalNombre = (emp.sucursales as { nombre: string } | null)?.nombre ?? ''
    // Resuelve el horario vigente por fecha usando el historial de sucursal del empleado,
    // en vez de asumir su sucursal actual para todo el mes (ver bug de traslados).
    const horEf = construirResolverHorarios({
      historial: historialPorEmp.get(emp.id) ?? [],
      horariosPersonales: pers,
      horariosPorSucursal: horPorSuc,
      esJuanBJustoPorSucursal,
      sucursalIdFallback: emp.sucursal_id,
    })
    const fi = new Date((emp as { created_at: string }).created_at).toLocaleDateString('sv-SE', { timeZone: TZ })

    const justifiedRows = (justificaciones ?? []).filter(j => j.empleado_id === emp.id && j.justificada)
    const fferiadoMJ = new Set<string>()
    const fjust = new Set<string>()
    justifiedRows.forEach(j => {
      const parsed = parseJustificacionMotivo(j.motivo)
      const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
      if (parsed.tipo === 'feriado' || parsed.tipo === 'media_jornada') fferiadoMJ.add(key)
      else fjust.add(key)
    })
    const finjust = new Set<string>()
    ;(justificaciones ?? []).filter(j => j.empleado_id === emp.id && !j.justificada).forEach(j => {
      const parsed = parseJustificacionMotivo(j.motivo)
      const key = parsed.turno && parsed.turno !== 'all' ? `${j.fecha}_${parsed.turno}` : j.fecha
      finjust.add(key)
    })

    const isLibre = emp.rol === 'administracion'
    const inas  = isLibre ? calcularInasistenciasLibre(regs, mes, fi, finjust, fferiadoMJ) : calcularInasistencias(regs, horEf, mes, fi, finjust, fferiadoMJ)
    const inasJ = isLibre ? calcularInasistenciasJustificadasLibre(regs, mes, fjust, fi, fferiadoMJ) : calcularInasistenciasJustificadas(regs, horEf, mes, fjust, fi, fferiadoMJ)
    const res   = calcularMes(regs, sueldo, montoPresentismo, inas, inasJ, finjust)

    return {
      empleadoId: emp.id,
      nombre: emp.nombre,
      apellido: emp.apellido,
      dni: emp.dni as string | null,
      sucursalId: emp.sucursal_id,
      sucursalNombre,
      rol: (emp as { rol: string }).rol,
      sueldo,
      diasTrabajados: res.diasTrabajados,
      tardanzas: res.tardanzas,
      inasistencias: res.inasistencias,
      inasistenciasJustificadas: res.inasistenciasJustificadas,
      minutosExtraTotal: res.minutosExtraTotal,
      horasExtraFormato: res.horasExtraFormato,
      montoExtra: res.montoExtra,
      presentismo: res.presentismo,
      totalLiquidar: res.totalLiquidar,
      totalLiquidarExacto: res.totalLiquidarExacto,
    }
  })
}
