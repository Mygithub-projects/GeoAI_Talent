import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { STATEWIDE, PPD_DISTRICTS } from '@/lib/districts'
import { friendlyAuthError } from '@/lib/authErrorMessage'
import { AUTH_ERROR, mapSupabaseAuthError } from '@/lib/authErrorCodes'
import { MIN_PASSWORD_LENGTH } from '@/lib/authValidation'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'moe.gov.my'
const VALID_DISTRICTS = new Set<string>([STATEWIDE, ...PPD_DISTRICTS])

// POST /api/auth/register
// Validates the email domain (or admin allowlist), then creates a PENDING
// account that an administrator must approve before it can be used.
// Server-side only — both the allowlist check and the create use the
// service-role key.
export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; fullName?: unknown; ppd_district?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: AUTH_ERROR.UNKNOWN }, { status: 400 })
  }

  const email       = typeof body.email       === 'string' ? body.email.toLowerCase().trim() : ''
  const password    = typeof body.password    === 'string' ? body.password                   : ''
  const fullName    = typeof body.fullName    === 'string' ? body.fullName.trim()            : ''
  const ppdDistrict = typeof body.ppd_district === 'string' ? body.ppd_district.trim()        : ''

  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: 'email, password, and fullName are required', code: AUTH_ERROR.MISSING_FIELDS },
      { status: 400 },
    )
  }

  if (!VALID_DISTRICTS.has(ppdDistrict)) {
    return NextResponse.json(
      { error: 'Please select your district.', code: AUTH_ERROR.DISTRICT_REQUIRED },
      { status: 400 },
    )
  }

  // ── Email domain / allowlist check ───────────────────────────
  const isAllowedDomain = email.endsWith(`@${ALLOWED_DOMAIN}`)

  if (!isAllowedDomain) {
    // Check the admin_allowlist (requires service key — never exposed to client)
    try {
      const adminClient = createAdminClient()
      const { data: entry } = await adminClient
        .from('admin_allowlist')
        .select('email')
        .eq('email', email)
        .maybeSingle()

      if (!entry) {
        return NextResponse.json(
          {
            error: `This email address is not permitted to register. Please use your official @${ALLOWED_DOMAIN} email address or contact an administrator.`,
            code: AUTH_ERROR.EMAIL_NOT_ALLOWED,
          },
          { status: 403 }
        )
      }
    } catch {
      // SUPABASE_SERVICE_KEY not configured → fail closed
      return NextResponse.json(
        {
          error: `This email address is not permitted to register. Please use your official @${ALLOWED_DOMAIN} email address.`,
          code: AUTH_ERROR.EMAIL_NOT_ALLOWED,
        },
        { status: 403 }
      )
    }
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: AUTH_ERROR.WEAK_PASSWORD },
      { status: 400 },
    )
  }

  // ── Create the account ────────────────────────────────────────
  // Deliberately admin.createUser() with email_confirm, NOT auth.signUp().
  //
  // signUp() asks Supabase's BUILT-IN mailer to send a confirmation email,
  // and for this project that mailer fails outright:
  //   500 unexpected_failure "Error sending confirmation email"
  // (the bounce-rate restriction). Every registration therefore 500'd and
  // nobody could request an account at all.
  //
  // Skipping email confirmation loses nothing here, because this flow is
  // approval-gated by design: the address is already restricted to
  // @moe.gov.my or the admin allowlist (checked above), the account lands as
  // status='pending' via handle_new_user, and it stays unusable until an
  // administrator approves it. The admin — who sees the address before
  // approving — IS the verification step, and a stronger one than a
  // self-service email click.
  const adminClient = createAdminClient()

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (error || !data?.user) {
    const status = (error?.status ?? 0) >= 500 ? 502 : 400
    return NextResponse.json(
      {
        error: friendlyAuthError(error, 'We couldn’t complete your registration right now. Please double-check your email address and try again — if the problem continues, contact an administrator.'),
        code: mapSupabaseAuthError(error),
      },
      { status },
    )
  }

  // handle_new_user (DB trigger) has already inserted the profile row with
  // ppd_district=NULL by the time the user is created — set the district the
  // user requested here via the service-role client (enforce_profile_rules
  // blocks this column from a plain authenticated update, by design).
  {
    await adminClient
      .from('profiles')
      .update({ ppd_district: ppdDistrict })
      .eq('user_id', data.user.id)

    // Phase 8: alert every active admin in-app that a new registration is
    // awaiting approval (allowlisted sign-ups activate instantly — no alert
    // needed). Best-effort — a failure must never break registration.
    try {
      const { data: newProfile } = await adminClient
        .from('profiles')
        .select('status')
        .eq('user_id', data.user.id)
        .single()

      if (newProfile?.status === 'pending') {
        const { data: admins } = await adminClient
          .from('profiles')
          .select('user_id')
          .eq('role', 'admin')
          .eq('status', 'active')

        if (admins?.length) {
          await adminClient.from('notifications').insert(admins.map(a => ({
            user_id:    a.user_id,
            type:       'user_pending_approval',
            message_en: `New registration awaiting approval: ${fullName} (${email}), district ${ppdDistrict}.`,
            message_bm: `Pendaftaran baharu menunggu kelulusan: ${fullName} (${email}), daerah ${ppdDistrict}.`,
          })))
        }
      }
    } catch (err) {
      console.error('[register] admin notification failed:', err)
    }
  }

  return NextResponse.json({ success: true })
}
