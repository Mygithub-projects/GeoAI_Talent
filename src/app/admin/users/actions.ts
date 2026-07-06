'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Verify the calling user is an active admin
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'admin' || profile?.status !== 'active') {
    throw new Error('Forbidden: admin access required')
  }
  return { user, supabase }
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
  await requireAdmin()

  if (role === 'user' && !district) {
    throw new Error('Standard users must be assigned a district.')
  }

  const adminClient = createAdminClient()

  const { data: current } = await adminClient
    .from('profiles')
    .select('email')
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
  revalidatePath('/admin/users')
}

// Admin-created account: invites by email (Supabase sends a set-your-password
// link) and activates the account immediately with the chosen role/district —
// no separate approval step, since the admin is directly vouching for them.
export async function createUserByAdmin(
  email: string,
  fullName: string,
  role: 'admin' | 'user',
  district: string | null
) {
  await requireAdmin()

  if (role === 'user' && !district) {
    throw new Error('Standard users must be assigned a district.')
  }

  const adminClient = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
  })

  if (error) throw new Error(error.message)

  // handle_new_user already inserted a profile row (role/status defaulted by
  // the allowlist check) — override with what the admin actually chose and
  // activate immediately.
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ role, ppd_district: district, status: 'active' })
    .eq('user_id', data.user.id)

  if (profileError) throw new Error(profileError.message)
  revalidatePath('/admin/users')
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
  await requireAdmin()

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
    .select('email')
    .eq('user_id', userId)
    .single()
  if (current) await syncAuthEmail(adminClient, userId, email, current.email)

  const { error } = await adminClient
    .from('profiles')
    .update({ full_name: fullName, email, role, ppd_district: district })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}

// Suspend an active user: blocks login, keeps all history intact, fully reversible.
export async function suspendUser(userId: string) {
  const { user } = await requireAdmin()
  if (user.id === userId) throw new Error('You cannot suspend your own account.')

  const adminClient = createAdminClient()
  await assertNotLastAdmin(adminClient, userId)

  const { error } = await adminClient
    .from('profiles')
    .update({ status: 'suspended' })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}

// Reverse a suspension.
export async function reactivateUser(userId: string) {
  await requireAdmin()

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ status: 'active' })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}

// Permanently delete a user's login and profile. Refuses up front (rather than
// letting the DB foreign-key constraints fail the delete) if the account has
// any history worth keeping — created engagements or trainer invitations —
// since training_engagements.created_by / engagement_trainers.invited_by have
// no ON DELETE action and would otherwise block the whole delete anyway.
export async function deleteUserAccount(userId: string) {
  const { user } = await requireAdmin()
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

  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}
