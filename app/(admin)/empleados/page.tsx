import { createClient } from '@/lib/supabase/server'
import { EmpleadosClient } from './EmpleadosClient'
import { PageHeader } from '@/components/admin/PageHeader'

export const dynamic = 'force-dynamic'

export default async function EmpleadosPage() {
  const supabase = createClient()

  const [{ data: empleados }, { data: sucursales }] = await Promise.all([
    supabase.from('empleados').select('*, sucursales(id, nombre)').order('apellido'),
    supabase.from('sucursales').select('id, nombre').order('nombre'),
  ])

  return (
    <div>
      <PageHeader eyebrow="Panel de administración" title="Empleados" subtitle={`${(empleados ?? []).length} en total`} />
      <EmpleadosClient empleados={empleados ?? []} sucursales={sucursales ?? []} />
    </div>
  )
}
