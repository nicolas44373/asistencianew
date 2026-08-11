import { createClient } from '@/lib/supabase/server'
import { AsistenciaClient } from './AsistenciaClient'
import { fechaHoyLocal } from '@/lib/utils/tiempo'
import { PageHeader } from '@/components/admin/PageHeader'

export const dynamic = 'force-dynamic'

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: { fecha?: string; sucursal_id?: string; empleado_id?: string; desde?: string; hasta?: string }
}) {
  const supabase = createClient()
  const fecha = searchParams.fecha ?? fechaHoyLocal()

  // Modo rango: filtra por período + empleado puntual, en vez de la matriz de un solo día
  const rangoActivo = Boolean(searchParams.desde && searchParams.hasta && searchParams.empleado_id)

  // Queries independientes en paralelo
  const [
    { data: sucursales },
    { data: empleados },
    { data: horarios },
    { data: horariosPersonales },
    { data: justificaciones }
  ] = await Promise.all([
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase.from('empleados')
      .select('id, nombre, apellido, sucursal_id')
      .eq('activo', true)
      .neq('rol', 'admin')
      .order('apellido'),
    supabase.from('horarios_sucursal').select('*'),
    supabase.from('horarios_empleado').select('*'),
    supabase.from('justificaciones').select('*').eq('fecha', fecha),
  ])

  let query = supabase
    .from('registros_asistencia')
    .select('*, empleados!empleado_id(id, nombre, apellido, sucursal_id, sucursales(nombre))')

  if (rangoActivo) {
    query = query
      .eq('empleado_id', searchParams.empleado_id!)
      .gte('fecha', searchParams.desde!)
      .lte('fecha', searchParams.hasta!)
      .order('fecha', { ascending: true })
      .order('turno', { ascending: true, nullsFirst: false })
  } else {
    query = query
      .eq('fecha', fecha)
      .order('hora_entrada', { ascending: true, nullsFirst: false })

    if (searchParams.empleado_id) {
      query = query.eq('empleado_id', searchParams.empleado_id)
    }

    // Filtro de sucursal: reutiliza los empleados ya traídos (evita una query extra)
    if (searchParams.sucursal_id) {
      const ids = (empleados ?? [])
        .filter(e => e.sucursal_id === searchParams.sucursal_id)
        .map(e => e.id)
      query = ids.length > 0
        ? query.in('empleado_id', ids)
        : query.eq('empleado_id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: registros, error: registrosError } = await query
  if (registrosError) console.error('[AsistenciaPage]', registrosError.message)

  return (
    <div>
      <PageHeader
        eyebrow="Panel de administración"
        title="Asistencia"
        subtitle={rangoActivo ? 'Filtrando por rango de fechas' : `Registros del ${fecha}`}
      />
      <AsistenciaClient
        registros={registros ?? []}
        sucursales={sucursales ?? []}
        empleados={empleados ?? []}
        horarios={horarios ?? []}
        horariosPersonales={horariosPersonales ?? []}
        justificaciones={justificaciones ?? []}
        fechaInicial={fecha}
        filtros={searchParams}
        rangoActivo={rangoActivo}
      />
    </div>
  )
}
