import { createClient } from '@/lib/supabase/server'
import { AsistenciaClient } from './AsistenciaClient'
import { fechaHoyLocal } from '@/lib/utils/tiempo'

export const dynamic = 'force-dynamic'

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: { fecha?: string; sucursal_id?: string; empleado_id?: string }
}) {
  const supabase = createClient()
  const fecha = searchParams.fecha ?? fechaHoyLocal()

  // Queries independientes en paralelo
  const [{ data: sucursales }, { data: empleados }, { data: horarios }] = await Promise.all([
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase.from('empleados')
      .select('id, nombre, apellido, sucursal_id')
      .eq('activo', true)
      .order('apellido'),
    supabase.from('horarios_sucursal').select('*'),
  ])

  // Filtro de sucursal: reutiliza los empleados ya traídos (evita una query extra)
  let query = supabase
    .from('registros_asistencia')
    .select('*, empleados!empleado_id(id, nombre, apellido, sucursal_id, sucursales(nombre))')
    .eq('fecha', fecha)
    .order('hora_entrada', { ascending: true, nullsFirst: false })

  if (searchParams.empleado_id) {
    query = query.eq('empleado_id', searchParams.empleado_id)
  }

  if (searchParams.sucursal_id) {
    const ids = (empleados ?? [])
      .filter(e => e.sucursal_id === searchParams.sucursal_id)
      .map(e => e.id)
    query = ids.length > 0
      ? query.in('empleado_id', ids)
      : query.eq('empleado_id', '00000000-0000-0000-0000-000000000000')
  }

  const { data: registros, error: registrosError } = await query
  if (registrosError) console.error('[AsistenciaPage]', registrosError.message)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Asistencia</h1>
      <AsistenciaClient
        registros={registros ?? []}
        sucursales={sucursales ?? []}
        empleados={empleados ?? []}
        horarios={horarios ?? []}
        fechaInicial={fecha}
        filtros={searchParams}
      />
    </div>
  )
}
