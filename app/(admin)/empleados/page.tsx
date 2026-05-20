import { createClient } from '@/lib/supabase/server'
import { EmpleadosClient } from './EmpleadosClient'

export const dynamic = 'force-dynamic'

export default async function EmpleadosPage() {
  const supabase = createClient()

  const [{ data: empleados }, { data: sucursales }] = await Promise.all([
    supabase.from('empleados').select('*, sucursales(id, nombre)').order('apellido'),
    supabase.from('sucursales').select('id, nombre').order('nombre'),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Empleados</h1>
      </div>
      <EmpleadosClient empleados={empleados ?? []} sucursales={sucursales ?? []} />
    </div>
  )
}
