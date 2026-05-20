import { createClient } from '@/lib/supabase/server'
import { fechaHoyLocal } from '@/lib/utils/tiempo'
import { DashboardClient } from './DashboardClient'

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
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard — {hoy}</h1>
      <DashboardClient
        empleados={(empleados ?? []) as unknown as Parameters<typeof DashboardClient>[0]['empleados']}
        registros={registros ?? []}
        horarios={horarios ?? []}
        hoy={hoy}
      />
    </div>
  )
}
