import type { SupabaseClient } from '@supabase/supabase-js'

// Recomputes training_engagements.workflow_status from the child
// engagement_trainers rows. Never touches a Cancelled engagement.
// Confirmed  = confirmed_count >= trainers_needed (fully staffed)
// Pending Invite = some trainer still awaiting a response
// Draft      = no trainer pending or confirmed (recruiting / all declined)
export async function recomputeEngagementStatus(
  admin: SupabaseClient,
  engagementId: string,
): Promise<void> {
  const { data: engagement } = await admin
    .from('training_engagements')
    .select('workflow_status, trainers_needed')
    .eq('engagement_id', engagementId)
    .single()

  if (!engagement || engagement.workflow_status === 'Cancelled') return

  const { data: rows } = await admin
    .from('engagement_trainers')
    .select('status')
    .eq('engagement_id', engagementId)

  const confirmedCount = (rows ?? []).filter(r => r.status === 'Confirmed').length
  const pendingCount   = (rows ?? []).filter(r => r.status === 'Pending Invite').length

  const nextStatus =
    confirmedCount >= engagement.trainers_needed ? 'Confirmed'
    : pendingCount > 0 ? 'Pending Invite'
    : 'Draft'

  if (nextStatus !== engagement.workflow_status) {
    await admin
      .from('training_engagements')
      .update({ workflow_status: nextStatus })
      .eq('engagement_id', engagementId)
  }
}
