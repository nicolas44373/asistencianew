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
      className="text-slate-400 hover:text-red-600 text-sm font-medium transition-colors"
    >
      Salir
    </button>
  )
}
