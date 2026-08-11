'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard',  label: 'Dashboard',  icon: '📊' },
  { href: '/empleados',  label: 'Empleados',  icon: '👥' },
  { href: '/asistencia', label: 'Asistencia', icon: '📋' },
  { href: '/reportes',   label: 'Reportes',   icon: '📈' },
  { href: '/config',     label: 'Config',     icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-16 md:w-56 bg-white border-r border-slate-200 flex flex-col py-3 shrink-0">
      {navItems.map(item => {
        const active = pathname?.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 h-5 w-1 rounded-full bg-blue-600 hidden md:block" />
            )}
            <span className="text-lg w-6 text-center shrink-0">{item.icon}</span>
            <span className="hidden md:block">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
