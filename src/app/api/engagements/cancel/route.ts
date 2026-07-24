import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { sendEmail, resolveVenueName } from '@/lib/email'
import { buildCancellationEmail } from '@/lib/emailContent'
import { getTrainerLocales } from '@/lib/trainerLocale'

// A workshop can now be cancelled even after trainers confirm — their
// consent was for a workshop that is no longer happening, so cancelling
// sends each an apology (see the whole-workshop branch below).
const CANCELLABLE = ['Draft', 'Pending Invite', 'Confirmed']

interface ApologyResult {
  trainer_id:      string
  trainer_name:    string
  email_sent_to:   string | null
  email_delivered: boolean
}

// trainer_id present  -> withdraw ONE pending invite (models the
//                        withdrawal as a Declined row so the trainer
//                        becomes available for other engagements).
// trainer_id absent   -> cancel the WHOLE workshop.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('user_id', user.id).single()

  let body: { engagement_id?: string; trainer_id?: string; reason?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { engagement_id, trainer_id, reason } = body
  if (!engagement_id)
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 })

  const admin = createAdminClient()

  const access = await checkEngagementAccess(admin, engagement_id, user.id, profile?.role)
  if (!access.ok)
    return NextResponse.json({ error: access.error }, { status: access.status })

  // ── Trainer-level withdraw ─────────────────────────────────────
  if (trainer_id) {
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
        { error: `Cannot withdraw an invite with status "${engTrainer.status}"` },
        { status: 409 },
      )

    const { error: updateErr } = await admin
      .from('engagement_trainers')
      .update({ status: 'Declined', responded_at: new Date().toISOString() })
      .eq('id', engTrainer.id)

    if (updateErr)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    await admin
      .from('invitation_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('engagement_id', engagement_id)
      .eq('trainer_id', trainer_id)
      .is('used_at', null)

    await recomputeEngagementStatus(admin, engagement_id)

    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'engagement.cancel',
      entity_type:  'training_engagement',
      entity_id:    engagement_id,
      payload_json: {
        scope:      'trainer',
        trainer_id,
        reason:     reason ?? null,
        actor_name: profile?.full_name,
      },
    })

    return NextResponse.json({ success: true })
  }

  // ── Whole-workshop cancel ───────────────────────────────────────
  const { data: engagement } = await admin
    .from('training_engagements')
    .select('workflow_status, created_by, training_title, start_date, end_date, dynamic_venue_name, venue_school_code')
    .eq('engagement_id', engagement_id)
    .single()

  if (!engagement)
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  if (!CANCELLABLE.includes(engagement.workflow_status as string))
    return NextResponse.json(
      { error: `Cannot cancel an engagement with status "${engagement.workflow_status}"` },
      { status: 409 },
    )

  const { error: updateErr } = await admin
    .from('training_engagements')
    .update({ workflow_status: 'Cancelled' })
    .eq('engagement_id', engagement_id)

  if (updateErr)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  // Invalidate every outstanding token so no trainer can still accept/decline
  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('engagement_id', engagement_id)
    .is('used_at', null)

  // ── Apology emails to affected trainers ─────────────────────────
  // Confirmed AND Pending-invite trainers were expecting this workshop;
  // notify both (Declined trainers already opted out). Mirrors the
  // reschedule per-trainer loop: best-effort, never throws out of the
  // send, and reports delivery per trainer to the caller/modal.
  let apology: ApologyResult[] = []
  const { data: affectedRows } = await admin
    .from('engagement_trainers')
    .select('trainer_id, status')
    .eq('engagement_id', engagement_id)
    .in('status', ['Confirmed', 'Pending Invite'])

  if (affectedRows && affectedRows.length > 0) {
    const { data: trainers } = await admin
      .from('master_trainers')
      .select('trainer_id, trainer_name, email')
      .in('trainer_id', affectedRows.map(r => r.trainer_id))

    const locales   = await getTrainerLocales(admin, engagement_id)
    const venueName = await resolveVenueName(admin, {
      dynamic_venue_name: engagement.dynamic_venue_name as string | null,
      venue_school_code:  engagement.venue_school_code as string | null,
    })
    // `|| undefined` so a blank TEST_INBOX_EMAIL= line falls back to the
    // trainer's own email ('' is not nullish, so ?? alone would keep it)
    const testInbox = process.env.TEST_INBOX_EMAIL || undefined

    apology = await Promise.all((trainers ?? []).map(async trainer => {
      const result: ApologyResult = {
        trainer_id:      trainer.trainer_id as string,
        trainer_name:    trainer.trainer_name as string,
        email_sent_to:   null,
        email_delivered: false,
      }

      const { subject, html } = buildCancellationEmail({
        lang:          locales.get(trainer.trainer_id as string) ?? 'bm',
        trainerName:   trainer.trainer_name as string,
        trainingTitle: (engagement.training_title as string | null) ?? 'Program Latihan',
        venueName,
        startDate:     engagement.start_date as string | null,
        endDate:       engagement.end_date as string | null,
      })

      result.email_sent_to = testInbox ?? (trainer.email as string | null) ?? null
      if (result.email_sent_to) {
        try {
          // console fallback = nothing actually delivered
          result.email_delivered = (await sendEmail({ to: result.email_sent_to, subject, html })) !== 'console'
        } catch (e) {
          console.error('[cancel] apology email error', trainer.trainer_id, e)
        }
      } else {
        console.warn(`[cancel] No email address for trainer ${trainer.trainer_id} and TEST_INBOX_EMAIL not set. Skipping send.`)
      }
      return result
    }))
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'engagement.cancel',
    entity_type:  'training_engagement',
    entity_id:    engagement_id,
    payload_json: {
      scope:            'engagement',
      previous_status:  engagement.workflow_status,
      reason:           reason ?? null,
      apology_emails:   apology,
      actor_name:       profile?.full_name,
    },
  })

  // In-app note for the creator when an admin cancelled THEIR workshop.
  // Best-effort — must never break the cancel.
  if (engagement.created_by && engagement.created_by !== user.id) {
    try {
      const title     = (engagement.training_title as string | null) ?? 'Workshop'
      const actorName = profile?.full_name ?? 'An administrator'
      await admin.from('notifications').insert({
        user_id: engagement.created_by,
        type:    'engagement_cancelled',
        message_en: `"${title}" was cancelled by ${actorName}; affected trainers were notified.`,
        message_bm: `"${title}" telah dibatalkan oleh ${actorName}; jurulatih terlibat telah dimaklumkan.`,
      })
    } catch (e) {
      console.error('[cancel] notification error', e)
    }
  }

  return NextResponse.json({ success: true, cancelled: apology })
}
