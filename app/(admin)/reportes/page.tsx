import { createClient } from '@/lib/supabase/server'
import { ReportesClient } from './ReportesClient'
import type { RegistroAsistencia } from '@/lib/types/database'
import { format } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

export const dynamic = 'force-dynamic'

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { mes?: string; sucursal_id?: string }
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

  // Todas las queries en paralelo
  const [
    { data: empleados },
    { data: registros },
    { data: config },
    { data: sucursales },
    { data: horarios },
    { data: horariosPersonales },
    { data: justificaciones },
  ] = await Promise.all([
    empleadosQuery,
    supabase.from('registros_asistencia')
      .select('empleado_id, fecha, hora_entrada, tarde, minutos_extra')
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
    supabase.from('justificaciones').select('empleado_id, fecha, justificada').gte('fecha', desde).lte('fecha', hasta),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Reportes Mensuales</h1>
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
      />
    </div>
  )
}
