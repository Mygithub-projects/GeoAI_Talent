import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/reset-password', '/update-password'])

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies to both the request and the response so the session is refreshed
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session (keeps JWT valid)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Allow auth callback through unconditionally
  if (pathname.startsWith('/auth/')) return response

  // Public trainer-facing pages: trainers are not app users — the signed
  // single-use token in the URL is the authentication. Pass through for
  // everyone (a logged-in coordinator opening one of these links must
  // not be bounced to /dashboard either).
  //   /feedback              — Phase 9 post-workshop feedback form
  //   /invitations/confirm   — accept/decline confirmation step (2026-07-13)
  //   /invitations/responded — response result page
  if (pathname === '/feedback' || pathname.startsWith('/invitations/')) return response

  // API routes handle their own auth (return JSON 401, not redirects)
  if (pathname.startsWith('/api/')) return response

  const isPublic = PUBLIC_PATHS.has(pathname)

  // ── Unauthenticated ──────────────────────────────────────────
  if (!user) {
    if (!isPublic) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  // ── Authenticated: fetch profile status ─────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role')
    .eq('user_id', user.id)
    .single()

  const status = profile?.status ?? 'pending'
  const role   = profile?.role   ?? 'user'

  // Pending users may only visit /awaiting-approval
  if (status === 'pending') {
    if (pathname !== '/awaiting-approval') {
      return NextResponse.redirect(new URL('/awaiting-approval', request.url))
    }
    return response
  }

  // Active users on auth pages → redirect to dashboard
  if (status === 'active' && isPublic && pathname !== '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Admin-only routes
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
