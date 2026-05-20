import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas públicas: solo login
  if (pathname === '/login' || pathname === '/') {
    if (user) {
      const rol = await getRol(supabase, user)
      const destino = rol === 'admin' ? '/dashboard' : '/fichar'
      return NextResponse.redirect(new URL(destino, request.url))
    }
    return supabaseResponse
  }

  // Sin sesión → a login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rutas de admin: verificar rol
  if (pathname.startsWith('/dashboard') ||
      pathname.startsWith('/empleados') ||
      pathname.startsWith('/asistencia') ||
      pathname.startsWith('/reportes') ||
      pathname.startsWith('/config')) {

    const rol = await getRol(supabase, user)
    if (rol !== 'admin') {
      return NextResponse.redirect(new URL('/fichar', request.url))
    }
  }

  return supabaseResponse
}

async function getRol(
  supabase: ReturnType<typeof createServerClient>,
  user: { id: string; app_metadata?: Record<string, unknown> }
): Promise<string | null> {
  // Fast path: role stored in JWT app_metadata (set when employee is created/updated)
  const rolMeta = user.app_metadata?.rol
  if (typeof rolMeta === 'string') return rolMeta

  // Fallback: DB query for existing users without app_metadata
  const { data } = await supabase.from('empleados').select('rol').eq('id', user.id).single()
  return data?.rol ?? null
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|workbox-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
