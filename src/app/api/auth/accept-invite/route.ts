import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AUTH_ERROR, mapSupabaseAuthError } from '@/lib/authErrorCodes'
import { MIN_PASSWORD_LENGTH } from '@/lib/authValidation'

// POST /api/auth/accept-invite
// Redeems an admin-issued account invitation: verifies the one-time token from
// the emailed link, then sets the password. Mirrors /api/auth/update-password —
// everything runs SERVER-side so browsers on restricted gov/school networks
// never need to reach Supabase directly.
//
// Why POST and not a GET that verifies-then-redirects: email security scanners
// prefetch GET links (the 2026-07-13 invitation bug). A GET calling verifyOtp
// would let a scanner burn the single-use token before the human ever clicks,
// leaving every invitee behind a scanning gateway permanently locked out. Same
// GET-validates / POST-mutates split as /invitations/confirm.
export async function POST(request: Request) {
  let body: { token_hash?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: AUTH_ERROR.UNKNOWN }, { status: 400 })
  }

  const tokenHash = typeof body.token_hash === 'string' ? body.token_hash.trim() : ''
  const password  = typeof body.password   === 'string' ? body.password         : ''

  if (!tokenHash) {
    return NextResponse.json(
      { error: 'Missing invitation token', code: AUTH_ERROR.CALLBACK_FAILED },
      { status: 400 },
    )
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: AUTH_ERROR.WEAK_PASSWORD },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  // Redeem the token. This is what establishes the session — the invitee has
  // no cookie until now. A used/expired/forged token lands here as an error,
  // reported as SESSION_EXPIRED so the UI can point at "Forgot password?".
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'recovery',
    token_hash: tokenHash,
  })

  if (verifyError) {
    const code = mapSupabaseAuthError(verifyError)
    return NextResponse.json(
      {
        error: verifyError.message,
        code: code === AUTH_ERROR.UNKNOWN ? AUTH_ERROR.SESSION_EXPIRED : code,
      },
      { status: code === AUTH_ERROR.SERVICE_UNAVAILABLE ? 502 : 401 },
    )
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'No session after token verification', code: AUTH_ERROR.SESSION_EXPIRED },
      { status: 401 },
    )
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password })
  if (passwordError) {
    const code = mapSupabaseAuthError(passwordError)
    return NextResponse.json(
      { error: passwordError.message, code },
      { status: code === AUTH_ERROR.SERVICE_UNAVAILABLE ? 502 : 400 },
    )
  }

  // Best-effort audit — never the password itself, only that it was set.
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'user.password_set',
      entity_type:  'profile',
      entity_id:    user.id,
      payload_json: { self_service: true, via: 'admin_invite' },
    })
  } catch (err) {
    console.error('[auth/accept-invite] audit insert failed:', err)
  }

  // Setting a password does NOT activate the account — admin-created accounts
  // land 'pending' and stay unusable until an admin approves. Return the status
  // so the page can send them to the waiting room instead of a dashboard the
  // proxy would bounce them off. Same contract as POST /api/auth/login.
  // Read on the request-scoped client (RLS profiles_select_own); default
  // 'pending' so a missing row fails closed toward the waiting room.
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ success: true, profileStatus: profile?.status ?? 'pending' })
}
