import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERROR, mapSupabaseAuthError } from '@/lib/authErrorCodes'

// POST /api/auth/reset-password
// Sends the password-reset email SERVER-side. The reset page used to call
// supabase.auth.resetPasswordForEmail() straight from the browser, which fails
// on restricted gov/school networks that can't reach Supabase directly — the
// same reason sign-in is proxied via /api/auth/login and the settings password
// change runs server-side.
export async function POST(request: Request) {
  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: AUTH_ERROR.UNKNOWN }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    return NextResponse.json(
      { error: 'Email is required', code: AUTH_ERROR.EMAIL_REQUIRED },
      { status: 400 },
    )
  }

  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
  })

  if (error) {
    const code = mapSupabaseAuthError(error)
    // Only transient/environmental failures are reported. Anything that could
    // reveal whether this address has an account is swallowed below.
    if (code === AUTH_ERROR.RATE_LIMITED || code === AUTH_ERROR.SERVICE_UNAVAILABLE) {
      return NextResponse.json(
        { error: error.message, code },
        { status: code === AUTH_ERROR.RATE_LIMITED ? 429 : 502 },
      )
    }
    console.error('[auth/reset-password] suppressed:', error.message)
  }

  // ALWAYS success otherwise — an unknown address must be indistinguishable
  // from a registered one, or this endpoint becomes an account-enumeration
  // oracle. The UI shows "check your email" either way.
  return NextResponse.json({ success: true })
}
