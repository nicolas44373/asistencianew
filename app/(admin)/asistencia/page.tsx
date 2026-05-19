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

  // Nota: se usa !empleado_id para disambiguar porque registros_asistencia
  // tiene dos FK a empleados (empleado_id y editado_por).
  let query = supabase
    .from('registros_asistencia')
    .select('*, empleados!empleado_id(id, nombre, apellido, sucursal_id, sucursales(nombre))')
    .eq('fecha', fecha)
    .order('hora_entrada', { ascending: true, nullsFirst: false })

  if (searchParams.empleado_id) {
    query = query.eq('empleado_id', searchParams.empleado_id)
  }

  // Filtro por sucursal: buscar primero los IDs de empleados de esa sucursal
  if (searchParams.sucursal_id) {
    const { data: empIds } = await supabase
      .from('empleados')
      .select('id')
      .eq('sucursal_id', searchParams.sucursal_id)
      .eq('activo', true)

    const ids = empIds?.map(e => e.id) ?? []
    query = ids.length > 0
      ? query.in('empleado_id', ids)
      : query.eq('empleado_id', '00000000-0000-0000-0000-000000000000') // sin resultados
  }

  const { data: registros, error: registrosError } = await query
  if (registrosError) console.error('[AsistenciaPage]', registrosError.message)

  const { data: sucursales } = await supabase
    .from('sucursales').select('id, nombre').order('nombre')

  const { data: empleados } = await supabase
    .from('empleados')
    .select('id, nombre, apellido, sucursal_id')
    .eq('activo', true)
    .order('apellido')

  const { data: horarios } = await supabase
    .from('horarios_sucursal').select('*')

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
