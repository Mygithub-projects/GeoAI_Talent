import { redirect } from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReportWorkshops } from '@/lib/reportData'
import { ReportsClient } from './_components/ReportsClient'

export const dynamic = 'force-dynamic'

// Phase 8B — Reporting Module. Read-only report over the existing
// engagement / invitation / travel-cost data (no separate workflow).
// Scoping follows the /engagements precedent: non-admins see only
// workshops they created; admins see everything. All figures come
// from the deterministic builder in src/lib/reportData.ts — the only
// AI involvement is the suggestion-only fit classification behind
// its own human-approved API.
export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/awaiting-approval')
  const isAdmin = profile.role === 'admin'

  const admin = createAdminClient()
  const { workshops, classificationAvailable } = await buildReportWorkshops(admin, user.id, isAdmin)

  return (
    <ReportsClient
      workshops={workshops}
      isAdmin={isAdmin}
      userId={user.id}
      classificationAvailable={classificationAvailable}
    />
  )
}
