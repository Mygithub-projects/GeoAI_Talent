import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Phase 9: trainer-feedback dashboard assembly ─────────────────
// One deterministic builder for the /trainer-feedback page, mirroring
// reportData.ts. Reads go through the admin client after the page's
// auth check, so the `.eq('created_by', userId)` scoping below IS the
// access boundary: non-admins see feedback only for workshops they
// created (the /engagements–/reports–/calendar ownership model).

export interface FeedbackComment {
  trainer_name: string | null
  comments:     string
  submitted_at: string
  rating_overall: number
}

export interface FeedbackWorkshopSummary {
  engagement_id:    string
  training_title:   string | null
  venue_name:       string | null
  start_date:       string | null
  end_date:         string | null
  workflow_status:  string
  /** confirmed trainers = the feedback-request denominator */
  confirmedCount:   number
  /** how many feedback requests have actually been emailed */
  requestedCount:   number
  responseCount:    number
  avgContent:       number | null
  avgMaterials:     number | null
  avgVenueLogistics: number | null
  avgCommunication: number | null
  avgOverall:       number | null
  recommendYes:     number
  recommendNo:      number
  comments:         FeedbackComment[]
}

export interface FeedbackBuildResult {
  workshops: FeedbackWorkshopSummary[]
  /** false = migration 027 not applied yet — feedback tables unavailable */
  feedbackAvailable: boolean
}

interface FeedbackRow {
  engagement_id:          string
  trainer_id:             string
  rating_content:         number
  rating_materials:       number
  rating_venue_logistics: number
  rating_communication:   number
  rating_overall:         number
  would_recommend:        boolean
  comments:               string | null
  submitted_at:           string
}

const avg = (vals: number[]): number | null =>
  vals.length === 0 ? null : Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10

export async function buildFeedbackWorkshops(
  admin: AdminClient,
  userId: string,
  isAdmin: boolean,
): Promise<FeedbackBuildResult> {
  // 1. Workshops, role-scoped — identical scoping block to buildReportWorkshops
  let engQuery = admin
    .from('training_engagements')
    .select('engagement_id, training_title, dynamic_venue_name, venue_school_code, start_date, end_date, workflow_status')
    .order('start_date', { ascending: false })
    .limit(500)
  if (!isAdmin) engQuery = engQuery.eq('created_by', userId)
  const { data: rawEngs } = await engQuery
  const engs = rawEngs ?? []
  const engIds = engs.map(e => e.engagement_id as string)
  if (engIds.length === 0) return { workshops: [], feedbackAvailable: true }

  // 2. Feedback rows — the tables arrive with migration 027; degrade
  // gracefully (banner, empty dashboard) if it hasn't been run yet.
  let fbRows: FeedbackRow[] = []
  let feedbackAvailable = true
  const fbRes = await admin
    .from('workshop_feedback')
    .select('engagement_id, trainer_id, rating_content, rating_materials, rating_venue_logistics, rating_communication, rating_overall, would_recommend, comments, submitted_at')
    .in('engagement_id', engIds)
    .limit(5000)
  if (fbRes.error) {
    feedbackAvailable = false
  } else {
    fbRows = (fbRes.data ?? []) as unknown as FeedbackRow[]
  }

  // 3. Confirmed-trainer counts + requests-sent counts per engagement.
  // feedback_email_sent_at also arrives with 027 — same graceful path.
  interface EtRow { engagement_id: string; status: string; feedback_email_sent_at?: string | null }
  let etRows: EtRow[] = []
  if (feedbackAvailable) {
    const etRes = await admin
      .from('engagement_trainers')
      .select('engagement_id, status, feedback_email_sent_at')
      .in('engagement_id', engIds)
    if (etRes.error) {
      feedbackAvailable = false
    } else {
      etRows = (etRes.data ?? []) as unknown as EtRow[]
    }
  }
  if (!feedbackAvailable) {
    const basic = await admin
      .from('engagement_trainers')
      .select('engagement_id, status')
      .in('engagement_id', engIds)
    etRows = (basic.data ?? []) as unknown as EtRow[]
  }

  // 4. Trainer names for the comments list
  const trainerIds = [...new Set(fbRows.map(r => r.trainer_id))]
  const { data: trainers } = trainerIds.length > 0
    ? await admin.from('master_trainers').select('trainer_id, trainer_name').in('trainer_id', trainerIds)
    : { data: [] }
  const trainerMap = Object.fromEntries((trainers ?? []).map(t => [t.trainer_id as string, t.trainer_name as string | null]))

  // 5. Venue-school names
  const schoolCodes = [...new Set(engs.map(e => e.venue_school_code as string | null).filter(Boolean) as string[])]
  const { data: schools } = schoolCodes.length > 0
    ? await admin.from('schools').select('school_code, school_name').in('school_code', schoolCodes)
    : { data: [] }
  const schoolMap = Object.fromEntries((schools ?? []).map(s => [s.school_code as string, s.school_name as string]))

  // 6. Assemble — only workshops with at least one confirmed trainer are
  // feedback-relevant; the rest never enter the pipeline.
  const fbByEng: Record<string, FeedbackRow[]> = {}
  for (const r of fbRows) (fbByEng[r.engagement_id] ??= []).push(r)

  const confirmedByEng: Record<string, number> = {}
  const requestedByEng: Record<string, number> = {}
  for (const r of etRows) {
    if (r.status === 'Confirmed') confirmedByEng[r.engagement_id] = (confirmedByEng[r.engagement_id] ?? 0) + 1
    if (r.feedback_email_sent_at) requestedByEng[r.engagement_id] = (requestedByEng[r.engagement_id] ?? 0) + 1
  }

  const workshops: FeedbackWorkshopSummary[] = engs
    .filter(e => (confirmedByEng[e.engagement_id as string] ?? 0) > 0)
    .map(e => {
      const eid = e.engagement_id as string
      const rows = fbByEng[eid] ?? []
      return {
        engagement_id:   eid,
        training_title:  (e.training_title as string | null) ?? null,
        venue_name:      (e.dynamic_venue_name as string | null)
                           ?? (e.venue_school_code ? schoolMap[e.venue_school_code as string] ?? null : null),
        start_date:      (e.start_date as string | null) ?? null,
        end_date:        (e.end_date as string | null) ?? null,
        workflow_status: e.workflow_status as string,
        confirmedCount:  confirmedByEng[eid] ?? 0,
        requestedCount:  requestedByEng[eid] ?? 0,
        responseCount:   rows.length,
        avgContent:        avg(rows.map(r => r.rating_content)),
        avgMaterials:      avg(rows.map(r => r.rating_materials)),
        avgVenueLogistics: avg(rows.map(r => r.rating_venue_logistics)),
        avgCommunication:  avg(rows.map(r => r.rating_communication)),
        avgOverall:        avg(rows.map(r => r.rating_overall)),
        recommendYes:    rows.filter(r => r.would_recommend).length,
        recommendNo:     rows.filter(r => !r.would_recommend).length,
        comments: rows
          .filter(r => r.comments && r.comments.trim().length > 0)
          .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
          .map(r => ({
            trainer_name:   trainerMap[r.trainer_id] ?? null,
            comments:       r.comments as string,
            submitted_at:   r.submitted_at,
            rating_overall: r.rating_overall,
          })),
      }
    })

  return { workshops, feedbackAvailable }
}
