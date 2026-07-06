import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import { checkEngagementAccess } from '@/lib/engagementAuth'

const CANCELLABLE = ['Draft', 'Pending Invite']

// trainer_id present  -> withdraw ONE pending invite (models the
//                        withdrawal as a Declined row so the trainer
//                        becomes available for other engagements).
// trainer_id absent   -> cancel the WHOLE workshop.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('user_id', user.id).single()

  let body: { engagement_id?: string; trainer_id?: string; reason?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { engagement_id, trainer_id, reason } = body
  if (!engagement_id)
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 })

  const admin = createAdminClient()

  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok)
    return NextResponse.json({ error: access.error }, { status: access.status })

  // ── Trainer-level withdraw ─────────────────────────────────────
  if (trainer_id) {
    const { data: engTrainer } = await admin
      .from('engagement_trainers')
      .select('id, status')
      .eq('engagement_id', engagement_id)
      .eq('trainer_id', trainer_id)
      .single()

    if (!engTrainer)
      return NextResponse.json({ error: 'This trainer has not been invited to this engagement' }, { status: 404 })
    if (engTrainer.status !== 'Pending Invite')
      return NextResponse.json(
        { error: `Cannot withdraw an invite with status "${engTrainer.status}"` },
        { status: 409 },
      )

    const { error: updateErr } = await admin
      .from('engagement_trainers')
      .update({ status: 'Declined', responded_at: new Date().toISOString() })
      .eq('id', engTrainer.id)

    if (updateErr)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    await admin
      .from('invitation_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('engagement_id', engagement_id)
      .eq('trainer_id', trainer_id)
      .is('used_at', null)

    await recomputeEngagementStatus(admin, engagement_id)

    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'engagement.cancel',
      entity_type:  'training_engagement',
      entity_id:    engagement_id,
      payload_json: {
        scope:      'trainer',
        trainer_id,
        reason:     reason ?? null,
        actor_name: profile?.full_name,
      },
    })

    return NextResponse.json({ success: true })
  }

  // ── Whole-workshop cancel ───────────────────────────────────────
  const { data: engagement } = await admin
    .from('training_engagements')
    .select('workflow_status')
    .eq('engagement_id', engagement_id)
    .single()

  if (!engagement)
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  if (!CANCELLABLE.includes(engagement.workflow_status as string))
    return NextResponse.json(
      { error: `Cannot cancel an engagement with status "${engagement.workflow_status}"` },
      { status: 409 },
    )

  const { error: updateErr } = await admin
    .from('training_engagements')
    .update({ workflow_status: 'Cancelled' })
    .eq('engagement_id', engagement_id)

  if (updateErr)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  // Invalidate every outstanding token so no trainer can still accept/decline
  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('engagement_id', engagement_id)
    .is('used_at', null)

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'engagement.cancel',
    entity_type:  'training_engagement',
    entity_id:    engagement_id,
    payload_json: {
      scope:            'engagement',
      previous_status:  engagement.workflow_status,
      reason:           reason ?? null,
      actor_name:       profile?.full_name,
    },
  })

  return NextResponse.json({ success: true })
}
