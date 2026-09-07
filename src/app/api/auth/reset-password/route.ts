import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildPasswordResetEmail } from '@/lib/emailContent'
import { AUTH_ERROR } from '@/lib/authErrorCodes'

// POST /api/auth/reset-password
// Sends the password-reset email SERVER-side. The reset page used to call
// supabase.auth.resetPasswordForEmail() straight from the browser, which fails
// on restricted gov/school networks that can't reach Supabase directly — the
// same reason sign-in is proxied via /api/auth/login and the settings password
// change runs server-side.
//
// It no longer calls resetPasswordForEmail() at all. That routes through
// Supabase's BUILT-IN recovery mailer, which is restricted for this project
// exactly like its invite and confirmation mailers — verified 2026-09-07,
// POST /auth/v1/recover returns
//   500 unexpected_failure "Error sending recovery email"
// so "Forgot password?" silently delivered nothing to anyone. We now mint the
// token ourselves and send it through sendEmail(), the same remedy applied to
// admin invitations, and the link points at OUR /set-password page rather than
// /auth/callback — which also sidesteps a second bug, that /auth/callback
// discards `next` for a pending account and the proxy blocks /update-password
// for one, so a pending user could never have completed a reset either way.
//
// The emailed URL is built on NEXT_PUBLIC_SITE_URL, never
// link.properties.action_link, which resolves to <project>.supabase.co and is
// blocked on the networks this app has to work on.
const ACCOUNT_EMAIL_LANG = 'en' as const

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin

  // Everything below is best-effort and NOTHING about the outcome reaches the
  // caller — see the response note at the bottom. Failures are logged instead.
  try {
    const adminClient = createAdminClient()

    // Look the account up first so a link is only ever minted for a real one.
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name, status')
      .eq('email', email)
      .maybeSingle()

    if (!profile) {
      console.warn('[auth/reset-password] no account for the address given; nothing sent')
    } else {
      // type 'recovery' is the one that means "set a password" and mints the
      // session kind /api/auth/accept-invite expects. Deliberately the same
      // token type as an admin invitation, so both flows redeem through one
      // tested path instead of two.
      const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/set-password` },
      })

      if (linkError || !link?.properties?.hashed_token) {
        console.error('[auth/reset-password] generateLink failed', linkError)
      } else {
        const setPasswordUrl =
          `${siteUrl}/set-password?token_hash=${encodeURIComponent(link.properties.hashed_token)}&reset=1`

        const { subject, html } = buildPasswordResetEmail({
          lang:     ACCOUNT_EMAIL_LANG,
          fullName: profile.full_name ?? email.split('@')[0],
          email,
          setPasswordUrl,
          loginUrl: `${siteUrl}/login`,
        })

        const transport = await sendEmail({ to: process.env.TEST_INBOX_EMAIL || email, subject, html })
        if (transport === 'console') {
          console.warn('[auth/reset-password] no email provider configured — link logged above only')
        }
      }
    }
  } catch (err) {
    console.error('[auth/reset-password] suppressed:', err)
  }

  // ALWAYS success, unconditionally — an unknown address must be
  // indistinguishable from a registered one, or this endpoint becomes an
  // account-enumeration oracle. The UI shows "check your email" either way.
  //
  // This is stricter than the previous version, which surfaced 429/502 for
  // transient provider failures. That was safe while Supabase's mailer failed
  // for EVERY address, existing or not. Now that we only send for an account
  // that exists, reporting a send failure would leak existence — so send
  // problems go to the server log and never to the caller.
  //
  // KNOWN, ACCEPTED LIMITATION: response TIME still differs — roughly 400ms
  // when no account matches versus ~2.5s when one does and an SMTP handshake
  // runs. The body is identical, but that gap is a weak enumeration signal.
  // Left as-is deliberately: closing it means either padding every request to
  // the slowest path (punishing real users on a slow network) or not awaiting
  // the send (which risks the request being torn down mid-send). Registration
  // is already domain-restricted and the admin allowlist is in the repo, so
  // the information gained is close to nil. Revisit if this app is ever
  // exposed to an untrusted network.
  return NextResponse.json({ success: true })
}
