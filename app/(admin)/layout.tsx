import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BotonLogout } from '@/components/admin/BotonLogout'
import { Sidebar } from '@/components/admin/Sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: empleado } = await supabase
    .from('empleados')
    .select('nombre, apellido')
    .eq('id', user.id)
    .single()

  const iniciales = `${empleado?.nombre?.[0] ?? ''}${empleado?.apellido?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-slate-800 text-sm block leading-tight hidden sm:block">Control de Asistencia</span>
            <span className="text-slate-400 text-xs hidden sm:block">Panel de administración</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-sm hidden md:block">
            {empleado?.nombre} {empleado?.apellido}
          </span>
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
            {iniciales || '—'}
          </div>
          <BotonLogout />
        </div>
      </header>

      <div className="flex flex-1">
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
