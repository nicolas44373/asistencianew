import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fechaHoyLocal } from '@/lib/utils/tiempo'
import { FicharClient } from './FicharClient'

export default async function FicharPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fechaHoy = fechaHoyLocal()

  // empleado y registros son independientes — se ejecutan en paralelo
  const [{ data: empleado }, { data: registros }] = await Promise.all([
    supabase.from('empleados').select('*, sucursales(id, nombre)').eq('id', user.id).single(),
    supabase.from('registros_asistencia')
      .select('*')
      .eq('empleado_id', user.id)
      .eq('fecha', fechaHoy)
      .order('hora_entrada', { ascending: true }),
  ])

  if (!empleado) redirect('/login')

  return (
    <FicharClient
      empleado={empleado}
      registrosIniciales={registros ?? []}
    />
  )
}
