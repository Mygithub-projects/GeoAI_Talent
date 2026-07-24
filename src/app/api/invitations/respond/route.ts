import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySignedToken, hashToken } from '@/lib/tokenSigning'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import { sendEmail, resolveVenueName } from '@/lib/email'
import { buildResponseAckEmail, buildTrainerResponseNotifyEmail } from '@/lib/emailContent'
import { getTrainerLocale } from '@/lib/trainerLocale'

// Public — reached from the accept/decline links in invitation emails.
// No app session exists, so every read/write goes through the
// service-role admin client.
//
// 2026-07-13: split into a read-only GET + a mutating POST. Email
// security scanners (Gmail/Yahoo/corporate antivirus) prefetch GET
// links in emails, which auto-accepted/declined invitations WITHOUT
// the trainer's action. GET now only validates the token and forwards
// to the public confirmation page (/invitations/confirm); the actual
// state change happens exclusively on the POST below, which only a
// real form submission from that page triggers — scanners never
// submit forms.

type AdminClient = ReturnType<typeof createAdminClient>

interface TokenRow {
  token_id:      string
  engagement_id: string
  trainer_id:    string
  action_scope:  string
  expires_at:    string
  used_at:       string | null
}

type Validation =
  | { ok: true; tokenRow: TokenRow; engTrainerId: string }
  | { ok: false; result: 'invalid' | 'already_used' | 'expired' }

// Read-only checks shared by GET (gate to the confirm page) and POST
// (re-checked immediately before mutating — never trust the gap).
async function validateToken(admin: AdminClient, token: string | null): Promise<Validation> {
  if (!token || !verifySignedToken(token)) return { ok: false, result: 'invalid' }

  const { data: tokenRow } = await admin
    .from('invitation_tokens')
    .select('token_id, engagement_id, trainer_id, action_scope, expires_at, used_at')
    .eq('token_hash', hashToken(token))
    .single()

  if (!tokenRow) return { ok: false, result: 'invalid' }
  if (tokenRow.used_at) return { ok: false, result: 'already_used' }
  if (new Date(tokenRow.expires_at) < new Date()) return { ok: false, result: 'expired' }

  const { data: engTrainer } = await admin
    .from('engagement_trainers')
    .select('id, status')
    .eq('engagement_id', tokenRow.engagement_id)
    .eq('trainer_id', tokenRow.trainer_id)
    .single()

  if (!engTrainer) return { ok: false, result: 'invalid' }
  if (engTrainer.status !== 'Pending Invite') return { ok: false, result: 'already_used' }

  return { ok: true, tokenRow: tokenRow as TokenRow, engTrainerId: engTrainer.id }
}

// ── GET: validate only, then show the confirmation page ─────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const admin = createAdminClient()

  const v = await validateToken(admin, token)
  if (!v.ok) {
    return NextResponse.redirect(new URL(`/invitations/responded?result=${v.result}`, req.url))
  }
  return NextResponse.redirect(new URL(`/invitations/confirm?token=${encodeURIComponent(token!)}`, req.url))
}

// ── POST: the trainer pressed Confirm — record the response ─────
export async function POST(req: NextRequest) {
  const redirectTo = (result: string, lang?: string) =>
    // 303 so the browser follows with a GET (this is a form POST). When
    // known, carry the trainer's language so the result page matches the
    // email (the responded page has no token to look it up itself).
    NextResponse.redirect(
      new URL(`/invitations/responded?result=${result}${lang ? `&lang=${lang}` : ''}`, req.url),
      303,
    )

  const form = await req.formData().catch(() => null)
  const token = (form?.get('token') ?? null) as string | null

  const admin = createAdminClient()
  const v = await validateToken(admin, token)
  if (!v.ok) return redirectTo(v.result)
  const { tokenRow, engTrainerId } = v

  const newStatus = tokenRow.action_scope === 'accept' ? 'Confirmed' : 'Declined'

  await admin
    .from('engagement_trainers')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', engTrainerId)

  // Mark this token used, and invalidate its sibling (accept <-> decline)
  // so neither link can be replayed after the trainer has responded.
  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_id', tokenRow.token_id)

  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('engagement_id', tokenRow.engagement_id)
    .eq('trainer_id', tokenRow.trainer_id)
    .neq('action_scope', tokenRow.action_scope)
    .is('used_at', null)

  await recomputeEngagementStatus(admin, tokenRow.engagement_id)

  const { data: trainer } = await admin
    .from('master_trainers')
    .select('trainer_name, email')
    .eq('trainer_id', tokenRow.trainer_id)
    .single()

  const { data: engagement } = await admin
    .from('training_engagements')
    .select('created_by, training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
    .eq('engagement_id', tokenRow.engagement_id)
    .single()

  // Acknowledgment email back to the trainer confirming what was recorded —
  // a pure receipt, no links or login prompt. Best-effort: a send failure
  // must never break the trainer's response flow.
  // The trainer's email language — the one chosen when they were invited
  // (migration 028; defaults BM). The receipt matches the invitation.
  const trainerLang = await getTrainerLocale(admin, tokenRow.engagement_id, tokenRow.trainer_id)
  let ackTransport: string | null = null
  try {
    if (trainer?.email && engagement) {
      const venueName = await resolveVenueName(admin, engagement)
      const { subject, html } = buildResponseAckEmail({
        lang:          trainerLang,
        trainerName:   trainer.trainer_name ?? '',
        accepted:      tokenRow.action_scope === 'accept',
        trainingTitle: engagement.training_title ?? 'TBC',
        venueName,
        startDate:     engagement.start_date,
        endDate:       engagement.end_date,
      })
      ackTransport = await sendEmail({ to: trainer.email, subject, html })
    }
  } catch (err) {
    console.error('[respond] acknowledgment email failed:', err)
  }

  await admin.from('audit_logs').insert({
    actor:        null,
    action:       tokenRow.action_scope === 'accept' ? 'engagement.accept' : 'engagement.decline',
    entity_type:  'training_engagement',
    entity_id:    tokenRow.engagement_id,
    payload_json: {
      trainer_id:         tokenRow.trainer_id,
      trainer_name:       trainer?.trainer_name ?? null,
      action:             tokenRow.action_scope,
      ack_email_sent_to:  trainer?.email ?? null,
      ack_email_delivered: ackTransport !== null && ackTransport !== 'console',
    },
  })

  // In-app notification for the engagement's coordinator (Phase 7): so they
  // see trainer responses without refreshing /engagements. Best-effort —
  // a failure here must never break the trainer's response flow.
  try {
    if (engagement?.created_by) {
      const trainerName = trainer?.trainer_name ?? 'A trainer'
      const workshop    = engagement.training_title ?? null
      const accepted    = tokenRow.action_scope === 'accept'
      await admin.from('notifications').insert({
        user_id: engagement.created_by,
        type:    accepted ? 'trainer_accepted' : 'trainer_declined',
        message_en: accepted
          ? `${trainerName} accepted the invitation${workshop ? ` for "${workshop}"` : ''}.`
          : `${trainerName} declined the invitation${workshop ? ` for "${workshop}"` : ''}.`,
        message_bm: accepted
          ? `${trainerName} menerima jemputan${workshop ? ` untuk "${workshop}"` : ''}.`
          : `${trainerName} menolak jemputan${workshop ? ` untuk "${workshop}"` : ''}.`,
      })
    }
  } catch (err) {
    console.error('[respond] notification insert failed:', err)
  }

  // Phase 8: email twin of the bell notification — tell the coordinator by
  // email too, so a decline is never missed just because they were offline.
  // Best-effort, same rule as everything else in this route.
  try {
    if (engagement?.created_by) {
      const { data: creator } = await admin
        .from('profiles')
        .select('full_name, email, preferred_language')
        .eq('user_id', engagement.created_by)
        .single()
      if (creator?.email) {
        const venueName = await resolveVenueName(admin, engagement)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        // This one goes to the coordinator (an app user), so it follows
        // THEIR own language preference, not the trainer's invite language.
        const { subject, html } = buildTrainerResponseNotifyEmail({
          lang:          creator.preferred_language === 'en' ? 'en' : 'bm',
          creatorName:   creator.full_name ?? '',
          trainerName:   trainer?.trainer_name ?? 'Jurulatih',
          accepted:      tokenRow.action_scope === 'accept',
          trainingTitle: engagement.training_title ?? 'TBC',
          venueName,
          startDate:     engagement.start_date,
          endDate:       engagement.end_date,
          backlogUrl:    `${siteUrl}/engagements`,
        })
        await sendEmail({ to: process.env.TEST_INBOX_EMAIL || creator.email, subject, html })
      }
    }
  } catch (err) {
    console.error('[respond] coordinator email failed:', err)
  }

  return redirectTo(tokenRow.action_scope === 'accept' ? 'accepted' : 'declined', trainerLang)
}
