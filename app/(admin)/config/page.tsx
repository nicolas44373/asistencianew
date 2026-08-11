import { createClient } from '@/lib/supabase/server'
import { ConfigClient } from './ConfigClient'
import { PageHeader } from '@/components/admin/PageHeader'

export const dynamic = 'force-dynamic'

export default async function ConfigPage() {
  const supabase = createClient()

  const [{ data: configs }, { data: horariosSucursal }] = await Promise.all([
    supabase
      .from('config_liquidacion')
      .select('*')
      .order('vigente_desde', { ascending: false })
      .limit(10),
    supabase
      .from('horarios_sucursal')
      .select('*, sucursales(nombre)')
      .order('es_sabado')
      .order('turno'),
  ])

  const actual = configs?.[0] ?? null

  return (
    <div>
      <PageHeader eyebrow="Panel de administración" title="Configuración" subtitle="Horarios de sucursal y presentismo" />
      <ConfigClient
        configActual={actual}
        historial={configs ?? []}
        horariosSucursal={horariosSucursal ?? []}
      />
    </div>
  )
}
