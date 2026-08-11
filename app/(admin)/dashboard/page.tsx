import { createClient } from '@/lib/supabase/server'
import { fechaHoyLocal } from '@/lib/utils/tiempo'
import { DashboardClient } from './DashboardClient'
import { PageHeader } from '@/components/admin/PageHeader'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const supabase = createClient()
  const hoy = fechaHoyLocal()

  const [{ data: empleados }, { data: registros }, { data: horarios }] = await Promise.all([
    supabase
      .from('empleados')
      .select('id, nombre, apellido, sucursal_id, sucursales(nombre)')
      .eq('activo', true)
      .neq('rol', 'admin')
      .order('apellido'),
    supabase
      .from('registros_asistencia')
      .select('id, empleado_id, hora_entrada, hora_salida, tarde')
      .eq('fecha', hoy),
    supabase
      .from('horarios_sucursal')
      .select('*'),
  ])

  return (
    <div>
      <PageHeader eyebrow="Panel de administración" title="Dashboard" subtitle={`Estado en tiempo real — ${hoy}`} />
      <DashboardClient
        empleados={(empleados ?? []) as unknown as Parameters<typeof DashboardClient>[0]['empleados']}
        registros={registros ?? []}
        horarios={horarios ?? []}
        hoy={hoy}
      />
    </div>
  )
}
