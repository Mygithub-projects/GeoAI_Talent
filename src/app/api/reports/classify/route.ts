import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { llm } from '@/lib/llm'

// Phase 8B — AI-assisted fit-classification SUGGESTIONS for one
// workshop's invited trainers. Strictly suggestion-only:
//   * Responded trainers are classified deterministically from their
//     own response (Confirmed → 'confirmed', Declined → 'declined') —
//     no LLM involved, and the human "decision" is the trainer's own.
//   * For not-yet-responded trainers the LLM proposes
//     suitable | pending_review | not_matched with a short bilingual
//     reason, grounded ONLY in the data we hand it (skills, district,
//     distance, cost — all computed by existing deterministic code).
//     The suggestion sits in fit_suggestion; the human-approved final
//     label (fit_classification) is set only via /api/reports/
//     classification. The LLM never generates numbers.
// Access: workshop creator or admin (checkEngagementAccess). Audited.

const SUGGESTION_LABELS = new Set(['suitable', 'pending_review', 'not_matched'])

interface LlmSuggestion {
  trainer_id: string
  label:      string
  reason_en:  string
  reason_bm:  string
}

function parseLlmJson(raw: string): LlmSuggestion[] {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = cleaned.indexOf('[')
  const end   = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array in LLM response')
  const arr = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(arr)) throw new Error('LLM response is not an array')
  return arr as LlmSuggestion[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { engagement_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.engagement_id) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const access = await checkEngagementAccess(admin, body.engagement_id, user.id, profile.role)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // ── Load workshop + invite rows ────────────────────────────────
  const { data: engagement } = await admin
    .from('training_engagements')
    .select('engagement_id, training_title, target_item_id, dynamic_venue_name, start_date, end_date')
    .eq('engagement_id', body.engagement_id)
    .single()
  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

  const { data: inviteRows, error: inviteErr } = await admin
    .from('engagement_trainers')
    .select('trainer_id, status, fit_classification')
    .eq('engagement_id', body.engagement_id)
  if (inviteErr) {
    // Most likely: migration 025 not applied
    return NextResponse.json({ error: `Classification unavailable — run migration 025 (${inviteErr.message})` }, { status: 500 })
  }
  if (!inviteRows?.length) return NextResponse.json({ error: 'No invited trainers to classify' }, { status: 400 })

  const now = new Date().toISOString()
  const updatedRows: Record<string, unknown>[] = []

  // ── 1. Deterministic mirror for responded trainers ─────────────
  let mirrored = 0
  for (const row of inviteRows) {
    const target = row.status === 'Confirmed' ? 'confirmed' : row.status === 'Declined' ? 'declined' : null
    if (!target || row.fit_classification === target) continue
    await admin
      .from('engagement_trainers')
      .update({ fit_classification: target, fit_decided_by: null, fit_decided_at: now })
      .eq('engagement_id', body.engagement_id)
      .eq('trainer_id', row.trainer_id)
    updatedRows.push({ trainer_id: row.trainer_id, fit_classification: target, fit_decided_at: now })
    mirrored++
  }

  // ── 2. LLM suggestions for pending trainers ────────────────────
  const pendingIds = inviteRows.filter(r => r.status === 'Pending Invite').map(r => r.trainer_id as string)
  let suggested = 0

  if (pendingIds.length > 0) {
    // Gather deterministic context per trainer
    const [{ data: trainers }, { data: links }, { data: logs }, { data: targetItem }] = await Promise.all([
      admin.from('master_trainers').select('trainer_id, trainer_name, ppd_district').in('trainer_id', pendingIds),
      admin.from('trainer_skills')
        .select('trainer_id, skills_subjects(name_en, type)')
        .in('trainer_id', pendingIds)
        .is('deleted_at', null),
      admin.from('travel_logs')
        .select('trainer_id, calculated_distance_km, suggested_transport_mode, estimated_cost_myr')
        .eq('engagement_id', body.engagement_id)
        .in('trainer_id', pendingIds),
      engagement.target_item_id != null
        ? admin.from('skills_subjects').select('name_en, name_bm').eq('item_id', engagement.target_item_id).single()
        : Promise.resolve({ data: null }),
    ])

    const skillsByTrainer: Record<string, string[]> = {}
    for (const l of links ?? []) {
      const ss = l.skills_subjects as unknown as { name_en: string; type: string } | null
      if (ss?.name_en) (skillsByTrainer[l.trainer_id as string] ??= []).push(`${ss.name_en} (${ss.type})`)
    }
    const logByTrainer = Object.fromEntries((logs ?? []).map(l => [l.trainer_id as string, l]))
    const nameByTrainer = Object.fromEntries((trainers ?? []).map(tr => [tr.trainer_id as string, tr]))

    const trainerContext = pendingIds.map(tid => ({
      trainer_id:   tid,
      district:     nameByTrainer[tid]?.ppd_district ?? null,
      skills:       skillsByTrainer[tid] ?? [],
      distance_km:  logByTrainer[tid]?.calculated_distance_km ?? null,
      transport:    logByTrainer[tid]?.suggested_transport_mode ?? null,
      est_cost_myr: logByTrainer[tid]?.estimated_cost_myr ?? null,
    }))

    const prompt = [
      {
        role: 'system' as const,
        content:
          'You are a classification assistant for a teacher-training coordination system. ' +
          'For each candidate trainer, judge their FIT for the workshop using ONLY the data provided ' +
          '(skill match to the workshop topic, travel distance/cost reasonableness). ' +
          'Label each trainer exactly one of: "suitable" (skills match and travel is reasonable), ' +
          '"pending_review" (partial match or borderline travel — a human should look closer), ' +
          '"not_matched" (skills clearly do not match the topic). ' +
          'Never invent data. Reasons must only reference the provided facts, quoting the given numbers verbatim if mentioned. ' +
          'Respond ONLY with a JSON array: ' +
          '[{"trainer_id": "...", "label": "...", "reason_en": "<max 20 words>", "reason_bm": "<max 20 words, Bahasa Melayu>"}] ' +
          '— one entry per trainer, no other text.',
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          workshop: {
            title:        engagement.training_title,
            topic:        (targetItem as { name_en?: string } | null)?.name_en ?? null,
            venue:        engagement.dynamic_venue_name,
            start_date:   engagement.start_date,
            end_date:     engagement.end_date,
          },
          trainers: trainerContext,
        }),
      },
    ]

    let suggestions: LlmSuggestion[]
    try {
      const raw = await llm(prompt, {
        model: process.env.LLM_MODEL_FAST || undefined,
        temperature: 0.2,
        maxTokens: 1600,
      })
      suggestions = parseLlmJson(raw)
    } catch (err) {
      console.error('[reports/classify] LLM failed:', err)
      return NextResponse.json(
        { error: 'AI suggestion service unavailable — try again shortly.', rows: updatedRows },
        { status: 502 },
      )
    }

    for (const s of suggestions) {
      if (!pendingIds.includes(s.trainer_id) || !SUGGESTION_LABELS.has(s.label)) continue
      const values = {
        fit_suggestion:   s.label,
        fit_reason_en:    String(s.reason_en ?? '').slice(0, 300) || null,
        fit_reason_bm:    String(s.reason_bm ?? '').slice(0, 300) || null,
        fit_suggested_at: now,
      }
      await admin
        .from('engagement_trainers')
        .update(values)
        .eq('engagement_id', body.engagement_id)
        .eq('trainer_id', s.trainer_id)
      updatedRows.push({ trainer_id: s.trainer_id, ...values })
      suggested++
    }
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'report.classify_suggest',
    entity_type:  'training_engagement',
    entity_id:    body.engagement_id,
    payload_json: {
      pending_count:   pendingIds.length,
      suggested_count: suggested,
      mirrored_count:  mirrored,
      actor_name:      profile.full_name ?? null,
    },
  })

  return NextResponse.json({ success: true, rows: updatedRows, suggested, mirrored })
}
