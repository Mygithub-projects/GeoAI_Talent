import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSignedToken, hashToken } from '@/lib/tokenSigning'
import { sendEmail, resolveVenueName } from '@/lib/email'
import { buildInvitationEmail, defaultInvitationMessage } from '@/lib/emailContent'
import { mergeTemplate } from '@/lib/emailTemplate'
import { checkEngagementAccess } from '@/lib/engagementAuth'

const INVITE_EXPIRY_DAYS = parseInt(process.env.INVITE_EXPIRY_DAYS ?? '7', 10)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Resends the invitation email to ONE still-pending trainer on an
// engagement — regenerates their token pair (invalidating the old
// ones first) and re-sends. Does not change engagement_trainers.status.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('user_id', user.id).single()

  let body: { engagement_id?: string; trainer_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { engagement_id, trainer_id } = body
  if (!engagement_id || !trainer_id)
    return NextResponse.json({ error: 'engagement_id and trainer_id are required' }, { status: 400 })

  const admin = createAdminClient()

  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok)
    return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: engagement } = await admin
    .from('training_engagements')
    .select('engagement_id, training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
    .eq('engagement_id', engagement_id)
    .single()

  if (!engagement)
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

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
      { error: `Can only re-invite a trainer who is still Pending Invite (current: "${engTrainer.status}")` },
      { status: 409 },
    )

  const { data: trainer } = await admin
    .from('master_trainers')
    .select('trainer_id, trainer_name, email')
    .eq('trainer_id', trainer_id)
    .single()

  if (!trainer)
    return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })

  const venueName = await resolveVenueName(admin, engagement)

  // Invalidate this trainer's outstanding tokens before issuing new ones
  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('engagement_id', engagement_id)
    .eq('trainer_id', trainer_id)
    .is('used_at', null)

  // Generate fresh tokens
  const expiresAt     = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  const acceptToken   = generateSignedToken()
  const declineToken  = generateSignedToken()

  const { error: tokenErr } = await admin.from('invitation_tokens').insert([
    { engagement_id, trainer_id: trainer.trainer_id, token_hash: hashToken(acceptToken),  action_scope: 'accept',  expires_at: expiresAt.toISOString() },
    { engagement_id, trainer_id: trainer.trainer_id, token_hash: hashToken(declineToken), action_scope: 'decline', expires_at: expiresAt.toISOString() },
  ])

  if (tokenErr) {
    console.error('[reinvite] token insert error', tokenErr)
    return NextResponse.json({ error: 'Failed to create invitation tokens' }, { status: 500 })
  }

  const acceptUrl  = `${SITE_URL}/api/invitations/respond?token=${encodeURIComponent(acceptToken)}`
  const declineUrl = `${SITE_URL}/api/invitations/respond?token=${encodeURIComponent(declineToken)}`

  const { subject, html } = buildInvitationEmail({
    lang:          'bm',
    customMessage: mergeTemplate(defaultInvitationMessage('bm'), { trainer_name: trainer.trainer_name as string }),
    trainingTitle: (engagement.training_title as string | null) ?? 'Program Latihan',
    venueName,
    startDate:     engagement.start_date as string | null,
    endDate:       engagement.end_date as string | null,
    acceptUrl,
    declineUrl,
    expiresAt,
  })

  // `|| undefined` so a blank TEST_INBOX_EMAIL= line falls back to the
  // trainer's own email ('' is not nullish, so ?? alone would keep it)
  const testInbox = process.env.TEST_INBOX_EMAIL || undefined
  const toEmail   = testInbox ?? (trainer.email as string | null) ?? null

  let emailDelivered = false
  if (toEmail) {
    try {
      // console fallback = nothing actually delivered
      emailDelivered = (await sendEmail({ to: toEmail, subject, html })) !== 'console'
    } catch (e) { console.error('[reinvite] email error', e) }
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'engagement.reinvite',
    entity_type:  'training_engagement',
    entity_id:    engagement_id,
    payload_json: {
      trainer_id:       trainer.trainer_id,
      trainer_name:     trainer.trainer_name,
      email_sent_to:    toEmail,
      email_delivered:  emailDelivered,
      token_expires_at: expiresAt.toISOString(),
      actor_name:       profile?.full_name,
    },
  })

  return NextResponse.json({
    success:          true,
    trainer_name:     trainer.trainer_name,
    email_sent_to:    toEmail,
    email_delivered:  emailDelivered,
    token_expires_at: expiresAt.toISOString(),
  })
}
