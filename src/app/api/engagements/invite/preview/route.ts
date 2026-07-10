import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveVenueName } from '@/lib/email'
import { defaultInvitationMessage, defaultInvitationSubject } from '@/lib/emailContent'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { validateInviteDateRange } from '@/lib/dateValidation'

const INVITE_EXPIRY_DAYS = parseInt(process.env.INVITE_EXPIRY_DAYS ?? '7', 10)

// Generates the initial editable draft for a batch invite. No DB
// writes — safe to call repeatedly as the admin adjusts the trainer
// selection. Returns the fixed context (venue/title/dates/expiry) plus
// a default plain-text message; the client builds the full branded
// HTML preview itself via emailContent.ts (no Node-only deps, safe to
// import client-side) so editing re-renders instantly with no round trip.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single()

  let body: { engagement_id?: string; trainer_ids?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { engagement_id, trainer_ids } = body
  if (!engagement_id || !trainer_ids?.length) {
    return NextResponse.json({ error: 'engagement_id and trainer_ids are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { data: engagement, error: engErr } = await admin
    .from('training_engagements')
    .select('training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
    .eq('engagement_id', engagement_id)
    .single()

  if (engErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }

  const validation = validateInviteDateRange(engagement.start_date as string | null, engagement.end_date as string | null)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const venueName = await resolveVenueName(admin, engagement)
  const trainingTitle = engagement.training_title ?? 'Program Latihan'

  const { data: firstTrainer } = await admin
    .from('master_trainers')
    .select('trainer_name')
    .eq('trainer_id', trainer_ids[0])
    .single()

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  return NextResponse.json({
    subject:       defaultInvitationSubject('bm', trainingTitle),
    message:       defaultInvitationMessage('bm'),
    venue_name:    venueName,
    training_title: trainingTitle,
    start_date:    engagement.start_date,
    end_date:      engagement.end_date,
    expires_at:    expiresAt.toISOString(),
    preview_trainer_name: firstTrainer?.trainer_name ?? '{{trainer_name}}',
    trainer_count: trainer_ids.length,
  })
}
