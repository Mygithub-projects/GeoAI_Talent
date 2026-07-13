import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateFeedbackToken } from '@/lib/feedbackToken'

// Phase 9 — public, token-gated feedback submission. Like
// /api/invitations/respond, no app session exists: the signed
// single-use token IS the authentication, and every read/write goes
// through the service-role admin client. The engagement/trainer ids
// come ONLY from the token row — anything in the request body naming
// them is ignored.

const RATING_FIELDS = [
  'rating_content',
  'rating_materials',
  'rating_venue_logistics',
  'rating_communication',
  'rating_overall',
] as const

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : null

  const admin = createAdminClient()
  const result = await validateFeedbackToken(admin, token)
  if (result.status !== 'valid') {
    // 410 for expired/used, 400 for a bad token — the form re-renders
    // the matching status panel from this reason.
    const status = result.status === 'invalid' ? 400 : 410
    return NextResponse.json({ error: result.status, reason: result.status }, { status })
  }
  const ctx = result.context

  // Server-side validation — never trust the client's checks.
  const ratings: Record<string, number> = {}
  for (const field of RATING_FIELDS) {
    const v = body[field]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      return NextResponse.json({ error: `${field} must be an integer between 1 and 5` }, { status: 400 })
    }
    ratings[field] = v
  }
  if (typeof body.would_recommend !== 'boolean') {
    return NextResponse.json({ error: 'would_recommend must be true or false' }, { status: 400 })
  }
  const comments = typeof body.comments === 'string' && body.comments.trim().length > 0
    ? body.comments.trim().slice(0, 4000)
    : null

  // Upsert (not insert): the UNIQUE(engagement_id, trainer_id) backstop
  // means a double-submit race updates rather than 409s; the token is
  // what gets marked used, not the row.
  const { error: fbErr } = await admin
    .from('workshop_feedback')
    .upsert(
      {
        engagement_id:   ctx.engagement_id,
        trainer_id:      ctx.trainer_id,
        ...ratings,
        would_recommend: body.would_recommend,
        comments,
        submitted_at:    new Date().toISOString(),
      },
      { onConflict: 'engagement_id,trainer_id' },
    )
  if (fbErr) {
    console.error('[feedback-submit] upsert failed:', fbErr)
    return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 })
  }

  await admin
    .from('feedback_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_id', ctx.token_id)

  // Best-effort audit — must never break the trainer's submission.
  try {
    await admin.from('audit_logs').insert({
      actor:        null,
      action:       'engagement.feedback_submitted',
      entity_type:  'training_engagement',
      entity_id:    ctx.engagement_id,
      payload_json: {
        trainer_id:      ctx.trainer_id,
        trainer_name:    ctx.trainer_name,
        rating_overall:  ratings.rating_overall,
        would_recommend: body.would_recommend,
        has_comments:    comments !== null,
      },
    })
  } catch (err) {
    console.error('[feedback-submit] audit insert failed:', err)
  }

  return NextResponse.json({ ok: true })
}
