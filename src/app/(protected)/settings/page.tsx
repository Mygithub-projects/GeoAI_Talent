import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './_components/SettingsClient'

export const dynamic = 'force-dynamic'

// Settings / My Account (2026-07-13) — the NavRail gear finally has a
// destination. Lean scope: read-only profile card, editable display
// name, change password (server-side — the browser can't always reach
// Supabase directly on restricted networks), language preference.
// Role/status/district stay admin-managed (no self-promotion rule).
export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role, status, ppd_district')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/awaiting-approval')

  return (
    <SettingsClient
      fullName={profile.full_name ?? ''}
      email={profile.email ?? user.email ?? ''}
      role={profile.role}
      district={profile.ppd_district}
    />
  )
}
