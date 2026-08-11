import { createClient } from '@/lib/supabase/server'
import { ReportesClient } from './ReportesClient'
import type { RegistroAsistencia } from '@/lib/types/database'
import { format } from 'date-fns-tz'
import { PageHeader } from '@/components/admin/PageHeader'

const TZ = 'America/Argentina/Buenos_Aires'

export const dynamic = 'force-dynamic'

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { mes?: string; sucursal_id?: string; empleado_id?: string }
}) {
  const supabase = createClient()
  const mesActual = searchParams.mes ?? format(new Date(), 'yyyy-MM', { timeZone: TZ })

  const [ano, mes] = mesActual.split('-').map(Number)
  const desde = `${mesActual}-01`
  const hasta = new Date(ano, mes, 0).toISOString().split('T')[0]

  let empleadosQuery = supabase
    .from('empleados')
    .select('*, sucursales(id, nombre)')
    .eq('activo', true)
    .neq('rol', 'admin')
    .order('apellido')
  if (searchParams.sucursal_id) {
    empleadosQuery = empleadosQuery.eq('sucursal_id', searchParams.sucursal_id)
  }
  if (searchParams.empleado_id) {
    empleadosQuery = empleadosQuery.eq('id', searchParams.empleado_id)
  }

  // Todas las queries en paralelo
  const [
    { data: empleados },
    { data: registros },
    { data: config },
    { data: sucursales },
    { data: horarios },
    { data: horariosPersonales },
    { data: justificaciones },
    { data: todosEmpleados },
    { data: historialSucursal },
  ] = await Promise.all([
    empleadosQuery,
    supabase.from('registros_asistencia')
      .select('empleado_id, fecha, hora_entrada, tarde, minutos_extra, turno')
      .gte('fecha', desde).lte('fecha', hasta),
    supabase.from('config_liquidacion')
      .select('monto_presentismo, vigente_desde, id, valor_hora_extra, created_at')
      .lte('vigente_desde', hasta)
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .single(),
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase.from('horarios_sucursal').select('*'),
    supabase.from('horarios_empleado').select('*'),
    supabase.from('justificaciones').select('empleado_id, fecha, justificada, motivo').gte('fecha', desde).lte('fecha', hasta),
    // Lista completa (sin filtros) para poblar el selector de empleado
    supabase.from('empleados').select('id, nombre, apellido').eq('activo', true).neq('rol', 'admin').order('apellido'),
    // Historial de sucursal: resuelve el horario vigente por fecha en vez de asumir la
    // sucursal actual del empleado para todo el mes (evita inasistencias falsas tras un traslado).
    supabase.from('empleado_sucursal_historial').select('empleado_id, sucursal_id, fecha_desde, fecha_hasta'),
  ])

  const { data: cierres } = await supabase
    .from('cierres_periodicos')
    .select('periodo, fecha_desde, fecha_hasta, generado_en, datos')
    .eq('tipo', 'mensual')
    .order('periodo', { ascending: false })
    .limit(12)

  return (
    <div>
      <PageHeader eyebrow="Panel de administración" title="Reportes mensuales" subtitle="Liquidación, horas extra y cierres automáticos" />
      <ReportesClient
        empleados={empleados ?? []}
        registros={(registros ?? []) as RegistroAsistencia[]}
        config={config}
        sucursales={sucursales ?? []}
        horarios={horarios ?? []}
        horariosPersonales={horariosPersonales ?? []}
        justificaciones={justificaciones ?? []}
        mesActual={mesActual}
        sucursalFiltro={searchParams.sucursal_id ?? ''}
        empleadoFiltro={searchParams.empleado_id ?? ''}
        todosEmpleados={todosEmpleados ?? []}
        cierresAutomaticos={cierres ?? []}
        historialSucursal={historialSucursal ?? []}
      />
    </div>
  )
}
