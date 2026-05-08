'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function BotonLogout() {
  const router = useRouter()
  const supabase = createClient()

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <button
      onClick={cerrarSesion}
      className="text-blue-200 hover:text-white text-sm transition-colors"
    >
      Salir
    </button>
  )
}
