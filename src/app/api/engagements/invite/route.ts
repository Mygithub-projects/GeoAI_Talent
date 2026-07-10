import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSignedToken, hashToken } from '@/lib/tokenSigning'
import { sendEmail, resolveVenueName } from '@/lib/email'
import { buildInvitationEmail } from '@/lib/emailContent'
import { mergeTemplate } from '@/lib/emailTemplate'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { validateInviteDateRange } from '@/lib/dateValidation'

const INVITE_EXPIRY_DAYS = parseInt(process.env.INVITE_EXPIRY_DAYS ?? '7', 10)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

interface SentResult {
  trainer_id: string
  trainer_name: string
  email_sent_to: string | null
  email_delivered: boolean
  token_expires_at: string
}
interface SkippedResult {
  trainer_id: string
  reason: string
}

// Batch invite send — accepts the admin-edited subject/plain-text
// message and, per trainer, merges in the trainer's real name and
// rebuilds the full branded HTML via buildInvitationEmail(). One
// engagement_trainers row + one token pair + one audit_log row per trainer.
export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Load profile (for audit attribution) ───────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('user_id', user.id)
    .single()

  // ── 3. Parse body ────────────────────────────────────────────
  let body: { engagement_id?: string; trainer_ids?: string[]; subject?: string; message?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { engagement_id, trainer_ids, subject, message } = body
  if (!engagement_id || !trainer_ids?.length || !subject || !message) {
    return NextResponse.json(
      { error: 'engagement_id, trainer_ids, subject and message are required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── 4. Ownership check (admin OR the engagement's creator) ────
  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // ── 5. Load engagement ───────────────────────────────────────
  const { data: engagement, error: engErr } = await admin
    .from('training_engagements')
    .select('engagement_id, workflow_status, training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
    .eq('engagement_id', engagement_id)
    .single()

  if (engErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  if (!['Draft', 'Pending Invite'].includes(engagement.workflow_status)) {
    return NextResponse.json(
      { error: `Engagement is already ${engagement.workflow_status}` },
      { status: 409 },
    )
  }

  const validation = validateInviteDateRange(engagement.start_date as string | null, engagement.end_date as string | null)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // ── 6. Skip trainers already invited for this engagement ─────
  const { data: existingRows } = await admin
    .from('engagement_trainers')
    .select('trainer_id')
    .eq('engagement_id', engagement_id)
    .in('trainer_id', trainer_ids)

  const alreadyInvited = new Set((existingRows ?? []).map(r => r.trainer_id as string))
  const toInvite = trainer_ids.filter(id => !alreadyInvited.has(id))
  const skipped: SkippedResult[] = trainer_ids
    .filter(id => alreadyInvited.has(id))
    .map(id => ({ trainer_id: id, reason: 'already_invited' }))

  if (toInvite.length === 0) {
    return NextResponse.json({ success: true, sent: [], skipped })
  }

  // ── 7. Load trainers ──────────────────────────────────────────
  const { data: trainers, error: trainersErr } = await admin
    .from('master_trainers')
    .select('trainer_id, trainer_name, email')
    .in('trainer_id', toInvite)

  if (trainersErr || !trainers?.length) {
    return NextResponse.json({ error: 'Trainers not found' }, { status: 404 })
  }

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  // `|| undefined` so a blank TEST_INBOX_EMAIL= line falls back to the
  // trainer's own email ('' is not nullish, so ?? alone would keep it)
  const testInbox = process.env.TEST_INBOX_EMAIL || undefined
  const venueName = await resolveVenueName(admin, engagement)
  const trainingTitle = engagement.training_title ?? 'Program Latihan'

  // ── 8. Per-trainer: insert row, tokens, send email, audit log ─
  const sent: SentResult[] = []
  await Promise.all(trainers.map(async (trainer) => {
    const { error: rowErr } = await admin
      .from('engagement_trainers')
      .insert({
        engagement_id,
        trainer_id: trainer.trainer_id,
        status: 'Pending Invite',
        invited_by: user.id,
      })
    if (rowErr) {
      console.error('[invite] engagement_trainers insert error', trainer.trainer_id, rowErr)
      skipped.push({ trainer_id: trainer.trainer_id, reason: 'insert_failed' })
      return
    }

    const acceptToken  = generateSignedToken()
    const declineToken = generateSignedToken()

    const { error: tokenErr } = await admin
      .from('invitation_tokens')
      .insert([
        { engagement_id, trainer_id: trainer.trainer_id, token_hash: hashToken(acceptToken),  action_scope: 'accept',  expires_at: expiresAt.toISOString() },
        { engagement_id, trainer_id: trainer.trainer_id, token_hash: hashToken(declineToken), action_scope: 'decline', expires_at: expiresAt.toISOString() },
      ])
    if (tokenErr) {
      console.error('[invite] token insert error', trainer.trainer_id, tokenErr)
      skipped.push({ trainer_id: trainer.trainer_id, reason: 'token_failed' })
      return
    }

    const acceptUrl  = `${SITE_URL}/api/invitations/respond?token=${encodeURIComponent(acceptToken)}`
    const declineUrl = `${SITE_URL}/api/invitations/respond?token=${encodeURIComponent(declineToken)}`

    const mergedSubject = mergeTemplate(subject, { trainer_name: trainer.trainer_name, accept_url: acceptUrl, decline_url: declineUrl })
    const { html: mergedHtml } = buildInvitationEmail({
      lang:          'bm',
      customMessage: mergeTemplate(message, { trainer_name: trainer.trainer_name }),
      trainingTitle,
      venueName,
      startDate:     engagement.start_date,
      endDate:       engagement.end_date,
      acceptUrl,
      declineUrl,
      expiresAt,
    })

    const toEmail = testInbox ?? trainer.email ?? null
    let emailDelivered = false
    if (toEmail) {
      try {
        // console fallback = nothing actually delivered
        emailDelivered = (await sendEmail({ to: toEmail, subject: mergedSubject, html: mergedHtml })) !== 'console'
      } catch (emailErr) {
        console.error('[invite] email send error', trainer.trainer_id, emailErr)
        // Do NOT roll back — tokens are issued, log it and continue
      }
    } else {
      console.warn(`[invite] No email address for trainer ${trainer.trainer_id} and TEST_INBOX_EMAIL not set. Skipping send.`)
    }

    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'engagement.invite',
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

    sent.push({
      trainer_id:       trainer.trainer_id,
      trainer_name:     trainer.trainer_name,
      email_sent_to:    toEmail,
      email_delivered:  emailDelivered,
      token_expires_at: expiresAt.toISOString(),
    })
  }))

  // ── 9. Bump workflow_status Draft -> Pending Invite on first round ──
  if (engagement.workflow_status === 'Draft' && sent.length > 0) {
    await admin
      .from('training_engagements')
      .update({ workflow_status: 'Pending Invite' })
      .eq('engagement_id', engagement_id)
  }

  return NextResponse.json({ success: true, sent, skipped })
}
