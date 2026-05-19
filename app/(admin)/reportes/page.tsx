import { createClient } from '@/lib/supabase/server'
import { ReportesClient } from './ReportesClient'
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
  const hasta = new Date(ano, mes, 0).toISOString().split('T')[0]  // último día del mes

  let empleadosQuery = supabase
    .from('empleados')
    .select('*, sucursales(id, nombre)')
    .eq('activo', true)
    .order('apellido')

  if (searchParams.sucursal_id) {
    empleadosQuery = empleadosQuery.eq('sucursal_id', searchParams.sucursal_id)
  }

  const { data: empleados } = await empleadosQuery

  const { data: registros } = await supabase
    .from('registros_asistencia')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)

  const { data: config } = await supabase
    .from('config_liquidacion')
    .select('*')
    .lte('vigente_desde', hasta)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .single()

  const { data: sucursales } = await supabase
    .from('sucursales').select('id, nombre').order('nombre')

  const { data: horarios } = await supabase
    .from('horarios_sucursal').select('*')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Reportes Mensuales</h1>
      <ReportesClient
        empleados={empleados ?? []}
        registros={registros ?? []}
        config={config}
        sucursales={sucursales ?? []}
        horarios={horarios ?? []}
        mesActual={mesActual}
        sucursalFiltro={searchParams.sucursal_id ?? ''}
      />
    </div>
  )
}
