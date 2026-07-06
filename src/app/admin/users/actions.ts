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

// Approve (or edit) a user: set status='active', assign role and district.
// The database trigger enforces the last-admin guard.
export async function approveUser(
  userId: string,
  role: 'admin' | 'user',
  district: string | null
) {
  await requireAdmin()

  if (role === 'user' && !district) {
    throw new Error('Standard users must be assigned a district.')
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({
      status: 'active',
      role,
      ppd_district: district,
    })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}

// Change an existing user's role and/or district.
// The DB trigger raises if this would remove the last admin.
export async function changeUserRole(
  userId: string,
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
        throw new Error('Cannot change role: this is the last active administrator.')
      }
    }
  }

  const { error } = await adminClient
    .from('profiles')
    .update({ role, ppd_district: district })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}
