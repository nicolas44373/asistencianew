import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BotonLogout } from '@/components/admin/BotonLogout'

const navItems = [
  { href: '/dashboard',  label: 'Dashboard',  icon: '📊' },
  { href: '/empleados',  label: 'Empleados',  icon: '👥' },
  { href: '/asistencia', label: 'Asistencia', icon: '📋' },
  { href: '/reportes',   label: 'Reportes',   icon: '📈' },
  { href: '/config',     label: 'Config',     icon: '⚙️' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: empleado } = await supabase
    .from('empleados')
    .select('nombre, apellido, rol')
    .eq('id', user.id)
    .single()

  if (empleado?.rol !== 'admin') redirect('/fichar')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-blue-700 text-white px-6 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-bold text-lg hidden sm:block">Control de Asistencia</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-blue-200 text-sm hidden md:block">
            {empleado?.nombre} {empleado?.apellido}
          </span>
          <BotonLogout />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <nav className="w-16 md:w-56 bg-white shadow-sm flex flex-col py-4 shrink-0">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-blue-50
                         hover:text-blue-700 transition-colors text-sm font-medium"
            >
              <span className="text-lg w-6 text-center">{item.icon}</span>
              <span className="hidden md:block">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
