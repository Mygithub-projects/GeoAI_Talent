import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'

// Edit a workshop's details (creator or admin).
// - training_title / dynamic_venue_name: editable while not Cancelled
// - start_date / end_date: editable ONLY while Draft — once invites are
//   sent, the dates are what trainers accepted; changing them requires
//   cancel + re-invite so consent stays honest.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('user_id', user.id).single()

  let body: {
    engagement_id?: string
    training_title?: string | null
    dynamic_venue_name?: string | null
    start_date?: string
    end_date?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { engagement_id } = body
  if (!engagement_id) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: engagement } = await admin
    .from('training_engagements')
    .select('engagement_id, workflow_status, training_title, dynamic_venue_name, start_date, end_date')
    .eq('engagement_id', engagement_id)
    .single()
  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  if (engagement.workflow_status === 'Cancelled') {
    return NextResponse.json({ error: 'A cancelled workshop cannot be edited' }, { status: 409 })
  }

  const changes: Record<string, unknown> = {}

  if (body.training_title !== undefined) {
    changes.training_title = (body.training_title ?? '').trim() || null
  }
  if (body.dynamic_venue_name !== undefined) {
    changes.dynamic_venue_name = (body.dynamic_venue_name ?? '').trim() || null
  }

  if (body.start_date !== undefined || body.end_date !== undefined) {
    if (engagement.workflow_status !== 'Draft') {
      return NextResponse.json(
        { error: 'Dates can only be changed while the workshop is still a Draft — invitations already reference these dates. Cancel and re-invite to reschedule.' },
        { status: 409 },
      )
    }
    const newStart = body.start_date ?? (engagement.start_date as string)
    const newEnd   = body.end_date   ?? (engagement.end_date as string)
    if (!DATE_RE.test(newStart) || !DATE_RE.test(newEnd)) {
      return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
    }
    if (newStart > newEnd) {
      return NextResponse.json({ error: 'Start date must be on or before the end date' }, { status: 400 })
    }
    changes.start_date = newStart
    changes.end_date   = newEnd
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error: upErr } = await admin
    .from('training_engagements')
    .update(changes)
    .eq('engagement_id', engagement_id)
    .select('engagement_id, training_title, dynamic_venue_name, start_date, end_date, workflow_status')
    .single()
  if (upErr) {
    console.error('[engagement update] error', upErr)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'engagement.update',
    entity_type:  'training_engagement',
    entity_id:    engagement_id,
    payload_json: {
      changes,
      previous: {
        training_title:     engagement.training_title,
        dynamic_venue_name: engagement.dynamic_venue_name,
        start_date:         engagement.start_date,
        end_date:           engagement.end_date,
      },
      actor_name: profile?.full_name,
    },
  })

  return NextResponse.json({ success: true, engagement: updated })
}
