import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'

// Permanently delete a DRAFT workshop (creator or admin). Drafts have
// sent nothing and notified nobody, so hard deletion is safe and keeps
// junk out of the Backlog's Cancelled stats. Anything past Draft must
// use Cancel (soft, keeps history, invalidates tokens) instead.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('user_id', user.id).single()

  let body: { engagement_id?: string }
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

  if (engagement.workflow_status !== 'Draft') {
    return NextResponse.json(
      { error: `Only Draft workshops can be permanently deleted (this one is ${engagement.workflow_status}). Use Cancel instead — it keeps the history and invalidates any outstanding invitation links.` },
      { status: 409 },
    )
  }

  // Belt and braces: a Draft should have no invites, but refuse if any exist
  const { count: inviteCount } = await admin
    .from('engagement_trainers')
    .select('*', { count: 'exact', head: true })
    .eq('engagement_id', engagement_id)
  if ((inviteCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This workshop already has trainer invitations — use Cancel instead of Delete.' },
      { status: 409 },
    )
  }

  // Children first (travel_logs rows are created by the recommend step)
  await admin.from('invitation_tokens').delete().eq('engagement_id', engagement_id)
  await admin.from('travel_logs').delete().eq('engagement_id', engagement_id)

  const { error: delErr } = await admin
    .from('training_engagements')
    .delete()
    .eq('engagement_id', engagement_id)
  if (delErr) {
    console.error('[engagement delete] error', delErr)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'engagement.delete',
    entity_type:  'training_engagement',
    entity_id:    engagement_id,
    payload_json: {
      deleted: {
        training_title:     engagement.training_title,
        dynamic_venue_name: engagement.dynamic_venue_name,
        start_date:         engagement.start_date,
        end_date:           engagement.end_date,
        workflow_status:    engagement.workflow_status,
      },
      actor_name: profile?.full_name,
    },
  })

  return NextResponse.json({ success: true })
}
