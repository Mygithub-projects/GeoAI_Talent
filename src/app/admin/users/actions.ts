'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildAccountApprovedEmail, buildAccountInviteEmail } from '@/lib/emailContent'
import { AUTH_ERROR, mapSupabaseAuthError } from '@/lib/authErrorCodes'
import { checkEmail } from '@/lib/authValidation'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isValidLocale } from '@/i18n'
import type { AdminActionResult } from '@/lib/adminActionResult'

// Verify the calling user is an active admin
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'admin' || profile?.status !== 'active') {
    throw new Error('Forbidden: admin access required')
  }
  return { user, profile, supabase }
}

// Every user-management action is a sensitive action → audit_logs row
// (same shape as the engagement/table-console writes).
async function writeUserAudit(
  adminClient: ReturnType<typeof createAdminClient>,
  actorId: string,
  actorName: string | null | undefined,
  action: string,
  targetUserId: string,
  payload: Record<string, unknown>,
) {
  await adminClient.from('audit_logs').insert({
    actor:        actorId,
    action,
    entity_type:  'profiles',
    entity_id:    targetUserId,
    payload_json: { ...payload, actor_name: actorName ?? null },
  })
}

// Updates the auth.users email (the actual login credential) via the Admin API
// when it's changed, keeping it in sync with profiles.email — there's no DB
// trigger that does this automatically on UPDATE (only on the initial INSERT).
async function syncAuthEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  newEmail: string,
  currentEmail: string
) {
  if (newEmail === currentEmail) return
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)
}

// Preflight last-admin guard shared by changeUserRole/suspendUser/deleteUserAccount.
async function assertNotLastAdmin(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: target } = await adminClient
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .single()

  if (target?.role === 'admin') {
    const { count } = await adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active')

    if ((count ?? 0) <= 1) {
      throw new Error('Cannot change: this is the last active administrator.')
    }
  }
}

// Approve (or edit) a user: set status='active', assign name/email/role/district.
// The database trigger enforces the last-admin guard.
export async function approveUser(
  userId: string,
  fullName: string,
  email: string,
  role: 'admin' | 'user',
  district: string | null
) {
  const { user: actor, profile: actorProfile } = await requireAdmin()

  if (role === 'user' && !district) {
    throw new Error('Standard users must be assigned a district.')
  }

  const adminClient = createAdminClient()

  const { data: current } = await adminClient
    .from('profiles')
    .select('email, status')
    .eq('user_id', userId)
    .single()
  if (current) await syncAuthEmail(adminClient, userId, email, current.email)

  const { error } = await adminClient
    .from('profiles')
    .update({
      status: 'active',
      full_name: fullName,
      email,
      role,
      ppd_district: district,
    })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  await writeUserAudit(adminClient, actor.id, actorProfile?.full_name, 'user.approve', userId, {
    full_name: fullName, email, role, district, previous_status: current?.status ?? null,
  })

  // A true approval is pending → active; re-running the modal on an
  // already-active user is just an edit — no notification/email then.
  if (current?.status === 'pending') {
    // In-app notification (best-effort — never fails the approval)
    try {
      await adminClient.from('notifications').insert({
        user_id:    userId,
        type:       'account_approved',
        message_en: `Your account has been approved. Role: ${role === 'admin' ? 'Administrator' : 'Standard User'}${district ? `, district: ${district}` : ''}.`,
        message_bm: `Akaun anda telah diluluskan. Peranan: ${role === 'admin' ? 'Pentadbir' : 'Pengguna Standard'}${district ? `, daerah: ${district}` : ''}.`,
      })
    } catch (e) {
      console.error('[approveUser] notification insert failed', e)
    }

    // Approval email (best-effort). BM default, matching the trainer
    // email convention; TEST_INBOX_EMAIL overrides like invite routes.
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
      const { subject, html } = buildAccountApprovedEmail({
        lang: 'bm', fullName, role, district, loginUrl: `${siteUrl}/login`,
      })
      await sendEmail({ to: process.env.TEST_INBOX_EMAIL || email, subject, html })
    } catch (e) {
      console.error('[approveUser] approval email failed', e)
    }
  }

  revalidatePath('/admin/users')
}

// Admin-created account: creates the account, activates it immediately with
// the chosen role/district (no separate approval step — the admin is directly
// vouching for them), and emails a set-your-own-password link.
//
// This deliberately does NOT use auth.admin.inviteUserByEmail(). That routes
// through Supabase's BUILT-IN mailer, which returns
//   500 unexpected_failure "Error sending invite email"
// for this project (bounce-rate restriction) — the actual cause of the broken
// Add-new-user button. It also pointed its redirect at /auth/callback, which
// only understands PKCE `?code=` and could never have consumed an
// admin-generated link. Both defects are gone: we mint the token ourselves and
// deliver it through sendEmail(), the transport every trainer email uses.
//
// Returns a result instead of throwing — an uncaught error in a 'use server'
// action is replaced by Next.js's generic "digest" placeholder in production,
// so the admin could never see what actually failed.
export async function createUserByAdmin(
  email: string,
  fullName: string,
  role: 'admin' | 'user',
  district: string | null
): Promise<AdminActionResult> {
  try {
    const { user: actor, profile: actorProfile } = await requireAdmin()
    const actorName = actorProfile?.full_name ?? null

    // ── Validate before writing anything ──────────────────────
    const emailCode = checkEmail(email)
    if (emailCode) return { ok: false, code: emailCode }
    if (role === 'user' && !district) {
      return { ok: false, code: AUTH_ERROR.DISTRICT_REQUIRED }
    }

    const adminClient = createAdminClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    // Pre-check so a duplicate reports as USER_EXISTS with a "sign in
    // instead" hint rather than an opaque provider error.
    const { data: existing } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('email', email)
      .maybeSingle()
    if (existing) return { ok: false, code: AUTH_ERROR.USER_EXISTS }

    // ── Create the auth user ──────────────────────────────────
    // `user_metadata` — NOT `data`, which is inviteUserByEmail's key. Getting
    // this wrong fails SILENTLY: handle_new_user falls back to the email
    // local-part, so the account would just carry the wrong name.
    //
    // `email_confirm: true` is required — nothing in this flow ever sends a
    // confirmation email, so without it the account could never log in. It
    // also makes the /reset-password fallback work when an invite expires.
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError || !created?.user) {
      console.error('[createUserByAdmin] createUser failed', createError)
      return { ok: false, code: mapSupabaseAuthError(createError) }
    }

    const newUserId = created.user.id

    // Compensating delete for the two steps below. Safe: profiles.user_id
    // cascades, and a seconds-old account cannot yet be referenced by the
    // un-cascaded FKs that make deleteUserAccount refuse. Wrapped so a failed
    // rollback never masks the real error code.
    const rollback = async (reason: string) => {
      try {
        await adminClient.auth.admin.deleteUser(newUserId)
      } catch (err) {
        console.error(`[createUserByAdmin] rollback after ${reason} failed`, err)
      }
    }

    // ── Mint the set-password token ───────────────────────────
    // type 'recovery', not 'invite'/'signup': those reject an already-existing
    // user, which is exactly what createUser just made. Recovery is the one
    // type meant for "set a password", and mints the session kind
    // /api/auth/accept-invite expects.
    const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl}/set-password` },
    })

    if (linkError || !link?.properties?.hashed_token) {
      console.error('[createUserByAdmin] generateLink failed', linkError)
      await rollback('generateLink')
      return { ok: false, code: AUTH_ERROR.SERVICE_UNAVAILABLE }
    }

    // Our own origin — never link.properties.action_link, which points at
    // <project>.supabase.co and is blocked on restricted gov networks.
    const setPasswordUrl =
      `${siteUrl}/set-password?token_hash=${encodeURIComponent(link.properties.hashed_token)}`

    // ── Apply the admin's chosen role/district ────────────────
    // handle_new_user already inserted the profile row; override it.
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ role, ppd_district: district, status: 'active' })
      .eq('user_id', newUserId)

    if (profileError) {
      console.error('[createUserByAdmin] profile update failed', profileError)
      await rollback('profile update')
      return { ok: false, code: AUTH_ERROR.UNKNOWN }
    }

    // ── Send the invitation ───────────────────────────────────
    // No rollback on failure: the account is complete and correct, and the
    // recipient can self-serve via "Forgot password?". Deleting a valid
    // account because SMTP hiccuped is strictly worse. Same call as
    // engagements/invite ("tokens are issued, log it and continue").
    let emailDelivered = false
    try {
      // The recipient has no stored locale yet, so the admin's active language
      // is the best available signal; falls back to the app default.
      const cookieStore = await cookies()
      const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
      const lang = isValidLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE

      const { subject, html } = buildAccountInviteEmail({
        lang,
        fullName,
        role,
        district,
        email,
        setPasswordUrl,
        invitedByName: actorName,
        loginUrl: `${siteUrl}/login`,
      })

      emailDelivered =
        (await sendEmail({ to: process.env.TEST_INBOX_EMAIL || email, subject, html })) !== 'console'
    } catch (err) {
      console.error('[createUserByAdmin] invite email failed', err)
    }

    // Best-effort — an audit failure must never undo a completed creation.
    try {
      await writeUserAudit(adminClient, actor.id, actorName, 'user.create', newUserId, {
        full_name: fullName, email, role, district,
        method: 'admin_create_own_smtp', email_delivered: emailDelivered,
      })
    } catch (err) {
      console.error('[createUserByAdmin] audit insert failed', err)
    }

    revalidatePath('/admin/users')
    return { ok: true, emailDelivered }
  } catch (err) {
    // requireAdmin() throws for an unauthenticated or non-admin caller;
    // anything else reaching here is genuinely unexpected.
    const message = err instanceof Error ? err.message : ''
    if (/not authenticated|forbidden/i.test(message)) {
      return { ok: false, code: AUTH_ERROR.FORBIDDEN }
    }
    console.error('[createUserByAdmin] unexpected failure', err)
    return { ok: false, code: AUTH_ERROR.UNKNOWN }
  }
}

// Change an existing user's name/email/role/district.
// The DB trigger raises if this would remove the last admin.
export async function changeUserRole(
  userId: string,
  fullName: string,
  email: string,
  role: 'admin' | 'user',
  district: string | null
) {
  const { user: actor, profile: actorProfile } = await requireAdmin()

  if (role === 'user' && !district) {
    throw new Error('Standard users must be assigned a district.')
  }

  const adminClient = createAdminClient()

  // Preflight last-admin guard (also enforced by DB trigger, but gives a nicer error here)
  if (role !== 'admin') {
    await assertNotLastAdmin(adminClient, userId)
  }

  const { data: current } = await adminClient
    .from('profiles')
    .select('email, full_name, role, ppd_district')
    .eq('user_id', userId)
    .single()
  if (current) await syncAuthEmail(adminClient, userId, email, current.email)

  const { error } = await adminClient
    .from('profiles')
    .update({ full_name: fullName, email, role, ppd_district: district })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  await writeUserAudit(adminClient, actor.id, actorProfile?.full_name, 'user.role_change', userId, {
    full_name: fullName, email, role, district,
    previous: current ? { full_name: current.full_name, email: current.email, role: current.role, district: current.ppd_district } : null,
  })

  revalidatePath('/admin/users')
}

// Suspend an active user: blocks login, keeps all history intact, fully reversible.
export async function suspendUser(userId: string) {
  const { user, profile: actorProfile } = await requireAdmin()
  if (user.id === userId) throw new Error('You cannot suspend your own account.')

  const adminClient = createAdminClient()
  await assertNotLastAdmin(adminClient, userId)

  const { error } = await adminClient
    .from('profiles')
    .update({ status: 'suspended' })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  await writeUserAudit(adminClient, user.id, actorProfile?.full_name, 'user.suspend', userId, {})

  revalidatePath('/admin/users')
}

// Reverse a suspension.
export async function reactivateUser(userId: string) {
  const { user: actor, profile: actorProfile } = await requireAdmin()

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ status: 'active' })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  await writeUserAudit(adminClient, actor.id, actorProfile?.full_name, 'user.reactivate', userId, {})

  revalidatePath('/admin/users')
}

// Permanently delete a user's login and profile. Refuses up front (rather than
// letting the DB foreign-key constraints fail the delete) if the account has
// any history worth keeping — created engagements or trainer invitations —
// since training_engagements.created_by / engagement_trainers.invited_by have
// no ON DELETE action and would otherwise block the whole delete anyway.
export async function deleteUserAccount(userId: string) {
  const { user, profile: actorProfile } = await requireAdmin()
  if (user.id === userId) throw new Error('You cannot delete your own account.')

  const adminClient = createAdminClient()
  await assertNotLastAdmin(adminClient, userId)

  const [{ count: engagementCount }, { count: inviteCount }] = await Promise.all([
    adminClient.from('training_engagements').select('*', { count: 'exact', head: true }).eq('created_by', userId),
    adminClient.from('engagement_trainers').select('*', { count: 'exact', head: true }).eq('invited_by', userId),
  ])

  if ((engagementCount ?? 0) > 0 || (inviteCount ?? 0) > 0) {
    throw new Error(
      'Cannot delete: this user has created engagements or sent invitations. Suspend the account instead to revoke access while keeping their history intact.'
    )
  }

  // Capture identity for the audit trail before the row disappears
  // (audit_logs.actor is SET NULL on delete, so the payload is the
  // only place the deleted user's name/email survive).
  const { data: target } = await adminClient
    .from('profiles')
    .select('full_name, email, role, ppd_district, status')
    .eq('user_id', userId)
    .single()

  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)

  await writeUserAudit(adminClient, user.id, actorProfile?.full_name, 'user.delete', userId, {
    deleted_profile: target ?? null,
  })

  revalidatePath('/admin/users')
}
