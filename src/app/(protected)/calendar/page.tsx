import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarClient } from './_components/CalendarClient'

export const dynamic = 'force-dynamic'

// Workshop calendar — month grid of engagements, color-coded by
// status, filterable by trainer. Scoped like /engagements and /reports
// (user decision 2026-07-12): admins see all workshops, non-admins
// only the ones they created. Data comes from GET /api/calendar,
// which re-checks auth and applies the scoping on every call.
export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/awaiting-approval')

  return <CalendarClient userId={user.id} isAdmin={profile.role === 'admin'} />
}
