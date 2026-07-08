import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarClient } from './_components/CalendarClient'

export const dynamic = 'force-dynamic'

// Workshop calendar — month grid of all engagements, color-coded by
// status, filterable by trainer. Visible to every active user (same
// visibility rationale as the availability search). Data comes from
// GET /api/calendar, which re-checks auth on every call.
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
