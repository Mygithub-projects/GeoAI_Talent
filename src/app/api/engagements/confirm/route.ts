import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import { checkEngagementAccess } from '@/lib/engagementAuth'

// Manual override: marks one trainer's pending invite as Confirmed
// without them clicking the email link (e.g. they confirmed verbally).
// Recomputes the parent workshop rollup.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('user_id', user.id).single()

  let body: { engagement_id?: string; trainer_id?: string; note?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { engagement_id, trainer_id, note } = body
  if (!engagement_id || !trainer_id)
    return NextResponse.json({ error: 'engagement_id and trainer_id are required' }, { status: 400 })

  const admin = createAdminClient()

  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok)
    return NextResponse.json({ error: access.error }, { status: access.status })

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
      { error: `Can only confirm a Pending Invite trainer (current: "${engTrainer.status}")` },
      { status: 409 },
    )

  const { error: updateErr } = await admin
    .from('engagement_trainers')
    .update({ status: 'Confirmed', responded_at: new Date().toISOString() })
    .eq('id', engTrainer.id)

  if (updateErr)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  await recomputeEngagementStatus(admin, engagement_id)

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'engagement.confirm',
    entity_type:  'training_engagement',
    entity_id:    engagement_id,
    payload_json: {
      trainer_id,
      method:     'manual_admin',
      note:       note ?? null,
      actor_name: profile?.full_name,
    },
  })

  return NextResponse.json({ success: true })
}
