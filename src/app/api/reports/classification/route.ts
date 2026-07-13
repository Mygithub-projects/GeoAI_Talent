import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'

// Phase 8B — record the HUMAN-approved fit classification for one
// (workshop, trainer) invite row. This is the human-approval gate for
// the AI suggestions from /api/reports/classify: only the workshop
// creator or an admin may set it, only on a not-yet-responded trainer
// (responded trainers are classified deterministically by their own
// accept/decline), and only to a manual label. Audited.

const MANUAL_LABELS = new Set(['suitable', 'pending_review', 'not_matched'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { engagement_id?: string; trainer_id?: string; classification?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.engagement_id || !body.trainer_id || !body.classification) {
    return NextResponse.json({ error: 'engagement_id, trainer_id and classification are required' }, { status: 400 })
  }
  if (!MANUAL_LABELS.has(body.classification)) {
    return NextResponse.json({ error: `classification must be one of: ${[...MANUAL_LABELS].join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const access = await checkEngagementAccess(admin, body.engagement_id, user.id, profile.role)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: row, error: rowErr } = await admin
    .from('engagement_trainers')
    .select('id, status, fit_suggestion, fit_classification')
    .eq('engagement_id', body.engagement_id)
    .eq('trainer_id', body.trainer_id)
    .single()
  if (rowErr || !row) return NextResponse.json({ error: 'Invite row not found' }, { status: 404 })

  if (row.status !== 'Pending Invite') {
    return NextResponse.json(
      { error: 'This trainer has already responded — their classification follows their own response.' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('engagement_trainers')
    .update({ fit_classification: body.classification, fit_decided_by: user.id, fit_decided_at: now })
    .eq('id', row.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'report.classification_set',
    entity_type:  'engagement_trainer',
    entity_id:    String(row.id),
    payload_json: {
      engagement_id:  body.engagement_id,
      trainer_id:     body.trainer_id,
      classification: body.classification,
      previous:       row.fit_classification ?? null,
      ai_suggestion:  row.fit_suggestion ?? null,
      followed_ai:    row.fit_suggestion === body.classification,
      actor_name:     profile.full_name ?? null,
    },
  })

  return NextResponse.json({ success: true, classification: body.classification, decided_at: now })
}
