import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSignedToken, hashToken } from '@/lib/tokenSigning'
import { sendEmail, resolveVenueName } from '@/lib/email'
import { buildInvitationEmail, defaultInvitationMessage } from '@/lib/emailContent'
import { mergeTemplate } from '@/lib/emailTemplate'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { getTrainerLocale } from '@/lib/trainerLocale'
import { validateInviteDateRange } from '@/lib/dateValidation'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import {
  inviteLinkExpiry, findBookingConflicts, isBookingConflictError, describeConflict, REINVITABLE_STATUSES,
} from '@/lib/trainerBooking'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Re-sends the invitation email to ONE trainer on an engagement —
// regenerates their token pair (invalidating the old ones first) and
// re-sends. Always a coordinator's deliberate action; nothing in the
// system re-invites automatically.
//   - Pending Invite: status unchanged, fresh links.
//   - No Response (released by the hourly job, migration 031) or Declined
//     (user decision 2026-11-06: allowed if needed): the trainer is booked
//     again → back to Pending Invite, but ONLY if they are not already
//     booked on overlapping dates elsewhere (blocked, never double-booked).
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
    .select('engagement_id, workflow_status, training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
    .eq('engagement_id', engagement_id)
    .single()

  if (!engagement)
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  if (engagement.workflow_status === 'Cancelled')
    return NextResponse.json({ error: 'This workshop has been cancelled' }, { status: 409 })

  // A link is capped at the workshop's start day, so re-inviting for a
  // workshop that has already started would send a dead link
  const validation = validateInviteDateRange(engagement.start_date as string | null, engagement.end_date as string | null)
  if (!validation.ok)
    return NextResponse.json({ error: validation.error }, { status: 400 })

  const { data: engTrainer } = await admin
    .from('engagement_trainers')
    .select('id, status')
    .eq('engagement_id', engagement_id)
    .eq('trainer_id', trainer_id)
    .single()

  if (!engTrainer)
    return NextResponse.json({ error: 'This trainer has not been invited to this engagement' }, { status: 404 })
  const previousStatus = engTrainer.status as string
  if (!(REINVITABLE_STATUSES as readonly string[]).includes(previousStatus))
    return NextResponse.json(
      { error: `This trainer cannot be re-invited (current: "${previousStatus}")` },
      { status: 409 },
    )

  // Booking a released/declined trainer again
  if (previousStatus !== 'Pending Invite') {
    if (engagement.workflow_status === 'Confirmed')
      return NextResponse.json({ error: 'This workshop is already fully staffed' }, { status: 409 })

    const conflicts = await findBookingConflicts(
      admin, [trainer_id], engagement.start_date as string | null, engagement.end_date as string | null, engagement_id,
    )
    const conflict = conflicts.get(trainer_id)
    if (conflict)
      return NextResponse.json(
        { error: describeConflict(conflict), code: 'TRAINER_DATE_CONFLICT', conflict },
        { status: 409 },
      )

    const rebook = { status: 'Pending Invite', invited_at: new Date().toISOString(), responded_at: null }
    let { error: rebookErr } = await admin
      .from('engagement_trainers')
      .update({ ...rebook, released_at: null })
      .eq('id', engTrainer.id)
    // Self-heal if migration 031 (released_at) isn't applied yet
    if (rebookErr && /released_at/i.test(rebookErr.message ?? '')) {
      ;({ error: rebookErr } = await admin.from('engagement_trainers').update(rebook).eq('id', engTrainer.id))
    }
    if (rebookErr) {
      if (isBookingConflictError(rebookErr))
        return NextResponse.json(
          { error: 'This trainer is already booked on overlapping dates', code: 'TRAINER_DATE_CONFLICT' },
          { status: 409 },
        )
      console.error('[reinvite] rebook error', rebookErr)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    await recomputeEngagementStatus(admin, engagement_id)
  }

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

  // Generate fresh tokens (never outliving the workshop's start day)
  const expiresAt     = inviteLinkExpiry(engagement.start_date as string | null)
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

  // Resend in the language chosen when the trainer was first invited
  const lang = await getTrainerLocale(admin, engagement_id, trainer_id)
  const { subject, html } = buildInvitationEmail({
    lang,
    customMessage: mergeTemplate(defaultInvitationMessage(lang), { trainer_name: trainer.trainer_name as string }),
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
      emailDelivered = (await sendEmail({
        to: toEmail, subject, html,
        sender: { name: profile?.full_name, email: user.email },
      })) !== 'console'
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
      previous_status:  previousStatus,
      actor_name:       profile?.full_name,
    },
  })

  return NextResponse.json({
    success:          true,
    status:           'Pending Invite',
    previous_status:  previousStatus,
    trainer_name:     trainer.trainer_name,
    email_sent_to:    toEmail,
    email_delivered:  emailDelivered,
    token_expires_at: expiresAt.toISOString(),
  })
}
