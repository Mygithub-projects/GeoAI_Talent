import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { generateSignedToken, hashToken } from '@/lib/tokenSigning'
import { sendEmail, resolveVenueName } from '@/lib/email'
import { buildRescheduleEmail } from '@/lib/emailContent'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import { validateInviteDateRange } from '@/lib/dateValidation'

// Edit a workshop's details (creator or admin).
// - training_title / dynamic_venue_name: editable while not Cancelled
// - start_date / end_date: editable while Draft as before; once invites
//   are sent, changing them is a RESCHEDULE and requires the explicit
//   confirm_reschedule flag — trainers accepted the old dates, so every
//   Pending Invite / Confirmed trainer is reset to Pending Invite, their
//   outstanding links invalidated, and a fresh date-change email with
//   new accept/decline links is sent so consent stays honest.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INVITE_EXPIRY_DAYS = parseInt(process.env.INVITE_EXPIRY_DAYS ?? '7', 10)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

interface RescheduledTrainer {
  trainer_id:      string
  trainer_name:    string
  previous_status: string
  email_sent_to:   string | null
  email_delivered: boolean
}

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
    confirm_reschedule?: boolean
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
    .select('engagement_id, workflow_status, training_title, dynamic_venue_name, venue_school_code, start_date, end_date, created_by')
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

  let isReschedule = false
  if (body.start_date !== undefined || body.end_date !== undefined) {
    const newStart = body.start_date ?? (engagement.start_date as string)
    const newEnd   = body.end_date   ?? (engagement.end_date as string)
    if (!DATE_RE.test(newStart) || !DATE_RE.test(newEnd)) {
      return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
    }
    if (newStart > newEnd) {
      return NextResponse.json({ error: 'Start date must be on or before the end date' }, { status: 400 })
    }
    const datesChanged = newStart !== engagement.start_date || newEnd !== engagement.end_date
    if (datesChanged) {
      if (engagement.workflow_status !== 'Draft') {
        // Post-invite date changes reset every non-declined trainer and
        // re-send invitations — callers must opt in explicitly.
        if (body.confirm_reschedule !== true) {
          return NextResponse.json(
            {
              error: 'Changing the dates of an invited workshop resets accepted trainers and re-sends invitations — confirmation required.',
              code:  'RESCHEDULE_CONFIRM_REQUIRED',
            },
            { status: 409 },
          )
        }
        const validation = validateInviteDateRange(newStart, newEnd)
        if (!validation.ok) {
          return NextResponse.json({ error: validation.error }, { status: 400 })
        }
        isReschedule = true
      }
      changes.start_date = newStart
      changes.end_date   = newEnd
    }
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

  // ── Reschedule: reset non-declined trainers and re-invite ────────
  // Runs AFTER the date update so the emails render the new dates; if a
  // send fails the system stays consistent (trainer is Pending Invite
  // with a live token) and Reinvite from the Backlog is the recovery.
  let reschedule:
    | { previous: { start_date: string | null; end_date: string | null }; token_expires_at: string; affected: RescheduledTrainer[] }
    | undefined

  if (isReschedule) {
    const newStart = changes.start_date as string
    const newEnd   = changes.end_date   as string

    const { data: affectedRows } = await admin
      .from('engagement_trainers')
      .select('id, trainer_id, status')
      .eq('engagement_id', engagement_id)
      .in('status', ['Pending Invite', 'Confirmed'])

    const now = new Date()
    // Cap the link expiry at the new start date — a confirmation link
    // must never outlive the workshop it confirms.
    const defaultExpiry = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const startCap      = new Date(`${newStart}T23:59:59`)
    const expiresAt     = startCap < defaultExpiry ? startCap : defaultExpiry

    let affected: RescheduledTrainer[] = []

    if (affectedRows && affectedRows.length > 0) {
      // 1. Reset statuses — the old response no longer applies
      await admin
        .from('engagement_trainers')
        .update({ status: 'Pending Invite', responded_at: null, invited_at: now.toISOString() })
        .in('id', affectedRows.map(r => r.id))

      // 2. Kill ALL outstanding links for this engagement in one shot
      await admin
        .from('invitation_tokens')
        .update({ used_at: now.toISOString() })
        .eq('engagement_id', engagement_id)
        .is('used_at', null)

      const { data: trainers } = await admin
        .from('master_trainers')
        .select('trainer_id, trainer_name, email')
        .in('trainer_id', affectedRows.map(r => r.trainer_id))

      const prevStatus = new Map(affectedRows.map(r => [r.trainer_id as string, r.status as string]))
      const venueName  = await resolveVenueName(admin, {
        dynamic_venue_name: updated.dynamic_venue_name as string | null,
        venue_school_code:  engagement.venue_school_code as string | null,
      })
      // `|| undefined` so a blank TEST_INBOX_EMAIL= line falls back to the
      // trainer's own email ('' is not nullish, so ?? alone would keep it)
      const testInbox = process.env.TEST_INBOX_EMAIL || undefined

      affected = await Promise.all((trainers ?? []).map(async trainer => {
        const result: RescheduledTrainer = {
          trainer_id:      trainer.trainer_id as string,
          trainer_name:    trainer.trainer_name as string,
          previous_status: prevStatus.get(trainer.trainer_id as string) ?? 'Pending Invite',
          email_sent_to:   null,
          email_delivered: false,
        }

        const acceptToken  = generateSignedToken()
        const declineToken = generateSignedToken()
        const { error: tokenErr } = await admin.from('invitation_tokens').insert([
          { engagement_id, trainer_id: trainer.trainer_id, token_hash: hashToken(acceptToken),  action_scope: 'accept',  expires_at: expiresAt.toISOString() },
          { engagement_id, trainer_id: trainer.trainer_id, token_hash: hashToken(declineToken), action_scope: 'decline', expires_at: expiresAt.toISOString() },
        ])
        if (tokenErr) {
          console.error('[reschedule] token insert error', trainer.trainer_id, tokenErr)
          return result
        }

        const acceptUrl  = `${SITE_URL}/api/invitations/respond?token=${encodeURIComponent(acceptToken)}`
        const declineUrl = `${SITE_URL}/api/invitations/respond?token=${encodeURIComponent(declineToken)}`

        const { subject, html } = buildRescheduleEmail({
          lang:          'bm',
          trainerName:   trainer.trainer_name as string,
          trainingTitle: (updated.training_title as string | null) ?? 'Program Latihan',
          venueName,
          oldStartDate:  engagement.start_date as string | null,
          oldEndDate:    engagement.end_date as string | null,
          newStartDate:  newStart,
          newEndDate:    newEnd,
          acceptUrl,
          declineUrl,
          expiresAt,
        })

        result.email_sent_to = testInbox ?? (trainer.email as string | null) ?? null
        if (result.email_sent_to) {
          try {
            // console fallback = nothing actually delivered
            result.email_delivered = (await sendEmail({ to: result.email_sent_to, subject, html })) !== 'console'
          } catch (e) {
            console.error('[reschedule] email error', trainer.trainer_id, e)
          }
        } else {
          console.warn(`[reschedule] No email address for trainer ${trainer.trainer_id} and TEST_INBOX_EMAIL not set. Skipping send.`)
        }
        return result
      }))

      // Confirmed → Pending Invite flips the engagement back too
      await recomputeEngagementStatus(admin, engagement_id)
    }

    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'engagement.reschedule',
      entity_type:  'training_engagement',
      entity_id:    engagement_id,
      payload_json: {
        previous_dates:   { start_date: engagement.start_date, end_date: engagement.end_date },
        new_dates:        { start_date: newStart, end_date: newEnd },
        token_expires_at: expiresAt.toISOString(),
        trainers:         affected,
        actor_name:       profile?.full_name,
      },
    })

    // In-app note for the creator when someone ELSE (an admin) moved
    // their workshop. Best-effort — must never break the reschedule.
    if (engagement.created_by && engagement.created_by !== user.id) {
      try {
        const title     = (updated.training_title as string | null) ?? 'Workshop'
        const actorName = profile?.full_name ?? 'An administrator'
        const oldRange  = `${engagement.start_date ?? '?'} – ${engagement.end_date ?? '?'}`
        const newRange  = `${newStart} – ${newEnd}`
        await admin.from('notifications').insert({
          user_id: engagement.created_by,
          type:    'engagement_rescheduled',
          message_en: `"${title}" was rescheduled by ${actorName} (${oldRange} → ${newRange}); trainers were asked to re-confirm.`,
          message_bm: `"${title}" telah dijadualkan semula oleh ${actorName} (${oldRange} → ${newRange}); jurulatih diminta mengesahkan semula.`,
        })
      } catch (e) {
        console.error('[reschedule] notification error', e)
      }
    }

    reschedule = {
      previous:         { start_date: engagement.start_date as string | null, end_date: engagement.end_date as string | null },
      token_expires_at: expiresAt.toISOString(),
      affected,
    }
  }

  return NextResponse.json({ success: true, engagement: updated, ...(reschedule ? { reschedule } : {}) })
}
