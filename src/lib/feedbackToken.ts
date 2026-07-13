import { verifySignedToken, hashToken } from '@/lib/tokenSigning'
import { resolveVenueName } from '@/lib/email'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Phase 9: feedback-token validation ───────────────────────────
// Shared by the public /feedback page (decides what to render) and
// the /api/feedback/submit route (never trusts client-held state —
// re-validates right before writing, same principle as the invitation
// respond route).

export interface FeedbackTokenContext {
  token_id:       string
  engagement_id:  string
  trainer_id:     string
  trainer_name:   string | null
  training_title: string | null
  venue_name:     string | null
  start_date:     string | null
  end_date:       string | null
  /** engagement_trainers.feedback_deadline_at — the stated fill-by date */
  deadline_at:    string | null
}

export type FeedbackTokenResult =
  | { status: 'valid'; context: FeedbackTokenContext }
  | { status: 'invalid' | 'expired' | 'already_submitted' }

export async function validateFeedbackToken(
  admin: AdminClient,
  token: string | undefined | null,
): Promise<FeedbackTokenResult> {
  if (!token || !verifySignedToken(token)) return { status: 'invalid' }

  const { data: row } = await admin
    .from('feedback_tokens')
    .select('token_id, engagement_id, trainer_id, expires_at, used_at')
    .eq('token_hash', hashToken(token))
    .single()

  if (!row) return { status: 'invalid' }
  if (row.used_at) return { status: 'already_submitted' }
  if (new Date(row.expires_at) < new Date()) return { status: 'expired' }

  // Defense in depth: even with an unused token, an existing submission
  // for this (engagement, trainer) pair counts as already submitted.
  const { data: existing } = await admin
    .from('workshop_feedback')
    .select('feedback_id')
    .eq('engagement_id', row.engagement_id)
    .eq('trainer_id', row.trainer_id)
    .maybeSingle()
  if (existing) return { status: 'already_submitted' }

  const [{ data: engagement }, { data: trainer }, { data: engTrainer }] = await Promise.all([
    admin
      .from('training_engagements')
      .select('training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
      .eq('engagement_id', row.engagement_id)
      .single(),
    admin
      .from('master_trainers')
      .select('trainer_name')
      .eq('trainer_id', row.trainer_id)
      .single(),
    admin
      .from('engagement_trainers')
      .select('feedback_deadline_at')
      .eq('engagement_id', row.engagement_id)
      .eq('trainer_id', row.trainer_id)
      .single(),
  ])

  if (!engagement) return { status: 'invalid' }

  const venueName = await resolveVenueName(admin, engagement)

  return {
    status: 'valid',
    context: {
      token_id:       row.token_id,
      engagement_id:  row.engagement_id,
      trainer_id:     row.trainer_id,
      trainer_name:   trainer?.trainer_name ?? null,
      training_title: engagement.training_title ?? null,
      venue_name:     venueName,
      start_date:     engagement.start_date ?? null,
      end_date:       engagement.end_date ?? null,
      deadline_at:    engTrainer?.feedback_deadline_at ?? null,
    },
  }
}
