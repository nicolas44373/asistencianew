import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fechaHoyLocal } from '@/lib/utils/tiempo'
import { FicharClient } from './FicharClient'

export default async function FicharPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: empleado } = await supabase
    .from('empleados')
    .select('*, sucursales(id, nombre)')
    .eq('id', user.id)
    .single()

  if (!empleado) redirect('/login')

  const fechaHoy = fechaHoyLocal()

  const { data: registros } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('empleado_id', user.id)
    .eq('fecha', fechaHoy)
    .order('hora_entrada', { ascending: true })

  return (
    <FicharClient
      empleado={empleado}
      registrosIniciales={registros ?? []}
    />
  )
}
