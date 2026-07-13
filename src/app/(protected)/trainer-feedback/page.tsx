import { redirect } from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildFeedbackWorkshops } from '@/lib/feedbackData'
import { TrainerFeedbackClient } from './_components/TrainerFeedbackClient'

export const dynamic = 'force-dynamic'

// Phase 9 — Trainer Feedback dashboard. Read-only analytics over the
// workshop_feedback submissions collected by the automated post-
// workshop email flow. Scoping follows the /reports–/calendar
// precedent: non-admins see only workshops they created; admins see
// everything. All figures come from the deterministic builder in
// src/lib/feedbackData.ts.
export default async function TrainerFeedbackPage() {
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
  const { workshops, feedbackAvailable } = await buildFeedbackWorkshops(admin, user.id, isAdmin)

  return (
    <TrainerFeedbackClient
      workshops={workshops}
      isAdmin={isAdmin}
      feedbackAvailable={feedbackAvailable}
    />
  )
}
