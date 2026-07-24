import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSignedToken, hashToken } from '@/lib/tokenSigning'
import { sendEmail } from '@/lib/email'
import { buildFeedbackRequestEmail } from '@/lib/emailContent'
import { getLocalesByRowId } from '@/lib/trainerLocale'

// Phase 9 — the daily feedback-request dispatcher, invoked headlessly
// by the Supabase pg_cron + pg_net job (migration 027). NO user session
// exists: the sole auth is the shared-secret header, checked before any
// DB access. Idempotent by design — eligible rows are those with
// feedback_email_sent_at IS NULL, and each row is atomically "claimed"
// (conditional UPDATE) before its email is sent, so neither a duplicate
// invocation nor a concurrent overlap can double-email a trainer.
//
// TODO: if the eligible set ever grows near the Gmail SMTP ~500/day
// cap, add a LIMIT to fn_pending_feedback_recipients and let the next
// daily run pick up the remainder — do not blast unbounded volume.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const FEEDBACK_TOKEN_EXPIRY_DAYS = parseInt(process.env.FEEDBACK_TOKEN_EXPIRY_DAYS ?? '17', 10)
const FEEDBACK_DEADLINE_DAYS = 14   // the deadline STATED to trainers; token outlives it by a grace window

interface RecipientRow {
  engagement_trainer_id: string
  engagement_id:         string
  trainer_id:            string
  trainer_name:          string | null
  trainer_email:         string | null
  training_title:        string | null
  dynamic_venue_name:    string | null
  venue_school_code:     string | null
  start_date:            string | null
  end_date:              string | null
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('fn_pending_feedback_recipients')
  if (error) {
    // Most likely migration 027 not applied yet — surface it plainly.
    console.error('[feedback-cron] eligibility RPC failed:', error)
    return NextResponse.json(
      { error: 'fn_pending_feedback_recipients failed — has migration 027 been applied?' },
      { status: 500 },
    )
  }
  const rows = (data ?? []) as RecipientRow[]

  // `|| undefined` so a blank TEST_INBOX_EMAIL= line falls back to the
  // trainer's own email ('' is not nullish, so ?? alone would keep it)
  const testInbox = process.env.TEST_INBOX_EMAIL || undefined

  // Venue-school names in one query (rows can share a school)
  const schoolCodes = [...new Set(rows.map(r => r.venue_school_code).filter(Boolean) as string[])]
  const { data: schools } = schoolCodes.length > 0
    ? await admin.from('schools').select('school_code, school_name').in('school_code', schoolCodes)
    : { data: [] }
  const schoolMap = Object.fromEntries((schools ?? []).map(s => [s.school_code as string, s.school_name as string]))

  // Each trainer's chosen invite language (migration 028; defaults BM),
  // so the feedback email months later matches what they first received.
  const locales = await getLocalesByRowId(admin, rows.map(r => r.engagement_trainer_id))

  const sent: Array<Record<string, unknown>> = []
  const skipped: Array<Record<string, unknown>> = []

  await Promise.all(rows.map(async row => {
    const sentAt     = new Date()
    const deadlineAt = new Date(sentAt.getTime() + FEEDBACK_DEADLINE_DAYS * 24 * 60 * 60 * 1000)
    const expiresAt  = new Date(sentAt.getTime() + FEEDBACK_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // Claim the row BEFORE sending: a conditional update that only
    // succeeds while feedback_email_sent_at is still NULL. If zero rows
    // come back, another invocation got here first — skip silently.
    const { data: claimed } = await admin
      .from('engagement_trainers')
      .update({
        feedback_email_sent_at: sentAt.toISOString(),
        feedback_deadline_at:   deadlineAt.toISOString(),
      })
      .eq('id', row.engagement_trainer_id)
      .is('feedback_email_sent_at', null)
      .select('id')
    if (!claimed || claimed.length === 0) {
      skipped.push({ trainer_id: row.trainer_id, engagement_id: row.engagement_id, reason: 'already_claimed' })
      return
    }

    const token = generateSignedToken()
    const { error: tokenErr } = await admin.from('feedback_tokens').insert({
      engagement_id: row.engagement_id,
      trainer_id:    row.trainer_id,
      token_hash:    hashToken(token),
      expires_at:    expiresAt.toISOString(),
    })
    if (tokenErr) {
      console.error('[feedback-cron] token insert error', row.trainer_id, tokenErr)
      skipped.push({ trainer_id: row.trainer_id, engagement_id: row.engagement_id, reason: 'token_insert_failed' })
      return
    }

    const venueName = row.dynamic_venue_name
      ?? (row.venue_school_code ? schoolMap[row.venue_school_code] ?? 'TBC' : 'TBC')
    const feedbackUrl = `${SITE_URL}/feedback?token=${encodeURIComponent(token)}`

    const { subject, html } = buildFeedbackRequestEmail({
      lang:          locales.get(row.engagement_trainer_id) ?? 'bm',
      trainerName:   row.trainer_name ?? '',
      trainingTitle: row.training_title ?? 'Program Latihan',
      venueName,
      startDate:     row.start_date,
      endDate:       row.end_date,
      deadlineDate:  deadlineAt.toISOString().split('T')[0],
      feedbackUrl,
    })

    const toEmail = testInbox ?? row.trainer_email ?? null
    let emailDelivered = false
    if (toEmail) {
      try {
        const transport = await sendEmail({ to: toEmail, subject, html })
        emailDelivered = transport !== 'console'
      } catch (err) {
        console.error('[feedback-cron] email send failed', row.trainer_id, err)
        // Do NOT roll back the claim — a transient SMTP failure must not
        // cause an infinite daily retry storm. The failure is visible in
        // the audit payload for manual follow-up.
      }
    } else {
      console.warn(`[feedback-cron] No email for trainer ${row.trainer_id} and TEST_INBOX_EMAIL not set. Skipping send.`)
    }

    await admin.from('audit_logs').insert({
      actor:        null,
      action:       'engagement.feedback_request_sent',
      entity_type:  'training_engagement',
      entity_id:    row.engagement_id,
      payload_json: {
        trainer_id:           row.trainer_id,
        trainer_name:         row.trainer_name,
        email_sent_to:        toEmail,
        email_delivered:      emailDelivered,
        feedback_deadline_at: deadlineAt.toISOString(),
        token_expires_at:     expiresAt.toISOString(),
      },
    })

    sent.push({
      trainer_id:           row.trainer_id,
      trainer_name:         row.trainer_name,
      engagement_id:        row.engagement_id,
      email_sent_to:        toEmail,
      email_delivered:      emailDelivered,
      feedback_deadline_at: deadlineAt.toISOString(),
    })
  }))

  return NextResponse.json({ success: true, processed: rows.length, sent, skipped })
}
