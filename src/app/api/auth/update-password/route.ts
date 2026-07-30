import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AUTH_ERROR, mapSupabaseAuthError } from '@/lib/authErrorCodes'
import { MIN_PASSWORD_LENGTH } from '@/lib/authValidation'

// POST /api/auth/update-password
// Completes a password reset SERVER-side. Mirrors /api/settings/password: the
// session cookie authenticates the update, so browsers on restricted gov/school
// networks never need to reach Supabase directly.
//
// The caller already holds a recovery session at this point — /auth/callback
// ran exchangeCodeForSession() before redirecting here. No session therefore
// means the reset link was expired, already used, or opened in a different
// browser, which we report as SESSION_EXPIRED so the UI can offer a new link.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'No active password-reset session', code: AUTH_ERROR.SESSION_EXPIRED },
      { status: 401 },
    )
  }

  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: AUTH_ERROR.UNKNOWN }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: AUTH_ERROR.WEAK_PASSWORD },
      { status: 400 },
    )
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const code = mapSupabaseAuthError(error)
    return NextResponse.json(
      { error: error.message, code },
      { status: code === AUTH_ERROR.SERVICE_UNAVAILABLE ? 502 : 400 },
    )
  }

  // Best-effort audit — never the password itself, only that it changed.
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'user.password_change',
      entity_type:  'profile',
      entity_id:    user.id,
      payload_json: { self_service: true, via: 'password_reset' },
    })
  } catch (err) {
    console.error('[auth/update-password] audit insert failed:', err)
  }

  return NextResponse.json({ success: true })
}
