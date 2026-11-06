import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { findBookingConflicts, isBookingConflictError, describeConflict } from '@/lib/trainerBooking'

// Manual override: marks one trainer's pending invite as Confirmed
// without them clicking the email link (e.g. they confirmed verbally).
// Also allowed for a trainer the hourly job released as No Response
// (migration 031) — but never onto dates they are already booked for
// elsewhere. Recomputes the parent workshop rollup.
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
  const previousStatus = engTrainer.status as string
  if (previousStatus !== 'Pending Invite' && previousStatus !== 'No Response')
    return NextResponse.json(
      { error: `Can only confirm a Pending Invite or No Response trainer (current: "${previousStatus}")` },
      { status: 409 },
    )

  if (previousStatus === 'No Response') {
    const { data: engagement } = await admin
      .from('training_engagements')
      .select('workflow_status, start_date, end_date')
      .eq('engagement_id', engagement_id)
      .single()
    if (!engagement || engagement.workflow_status === 'Cancelled')
      return NextResponse.json({ error: 'This workshop has been cancelled' }, { status: 409 })
    const conflict = (await findBookingConflicts(
      admin, [trainer_id], engagement.start_date as string | null, engagement.end_date as string | null, engagement_id,
    )).get(trainer_id)
    if (conflict)
      return NextResponse.json(
        { error: describeConflict(conflict), code: 'TRAINER_DATE_CONFLICT', conflict },
        { status: 409 },
      )
  }

  const confirmed = { status: 'Confirmed', responded_at: new Date().toISOString() }
  let { error: updateErr } = await admin
    .from('engagement_trainers')
    .update(previousStatus === 'No Response' ? { ...confirmed, released_at: null } : confirmed)
    .eq('id', engTrainer.id)
  if (updateErr && /released_at/i.test(updateErr.message ?? '')) {
    ;({ error: updateErr } = await admin.from('engagement_trainers').update(confirmed).eq('id', engTrainer.id))
  }

  if (updateErr) {
    if (isBookingConflictError(updateErr))
      return NextResponse.json(
        { error: 'This trainer is already booked on overlapping dates', code: 'TRAINER_DATE_CONFLICT' },
        { status: 409 },
      )
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

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
      previous_status: previousStatus,
      actor_name: profile?.full_name,
    },
  })

  return NextResponse.json({ success: true })
}
