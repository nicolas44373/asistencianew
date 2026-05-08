'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Tab = 'empleado' | 'admin'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [tab, setTab]           = useState<Tab>('empleado')
  const [dni, setDni]           = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Empleados usan email sintético basado en su DNI
    const emailAuth = tab === 'empleado'
      ? `${dni.trim()}@empleado.local`
      : email.trim()

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailAuth,
      password,
    })

    if (authError) {
      setError(
        tab === 'empleado'
          ? 'DNI o contraseña incorrectos'
          : 'Email o contraseña incorrectos'
      )
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: empleado } = await supabase
      .from('empleados')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (empleado?.rol === 'admin') {
      router.replace('/dashboard')
    } else {
      router.replace('/fichar')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-700 px-6 safe-top safe-bottom">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-4 shadow-lg">
            <svg className="w-10 h-10 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Control de Asistencia</h1>
        </div>

        {/* Tabs */}
        <div className="flex bg-blue-800/50 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => { setTab('empleado'); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'empleado'
                ? 'bg-white text-blue-700 shadow'
                : 'text-blue-200 hover:text-white'
            }`}
          >
            Empleado
          </button>
          <button
            type="button"
            onClick={() => { setTab('admin'); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'admin'
                ? 'bg-white text-blue-700 shadow'
                : 'text-blue-200 hover:text-white'
            }`}
          >
            Administrador
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'empleado' ? (
            <div>
              <label htmlFor="dni" className="block text-sm font-medium text-blue-100 mb-1">
                DNI
              </label>
              <input
                id="dni"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                required
                value={dni}
                onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-blue-300
                           border border-blue-400 focus:outline-none focus:ring-2 focus:ring-white text-base"
                placeholder="Ej: 40123456"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-blue-100 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-blue-300
                           border border-blue-400 focus:outline-none focus:ring-2 focus:ring-white text-base"
                placeholder="admin@gmail.com"
              />
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-blue-100 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-blue-300
                         border border-blue-400 focus:outline-none focus:ring-2 focus:ring-white text-base"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-300 text-sm text-center bg-red-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-white text-blue-700 font-bold text-lg
                       active:scale-95 transition-transform disabled:opacity-60 shadow-lg min-h-[64px]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Ingresando...
              </span>
            ) : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
