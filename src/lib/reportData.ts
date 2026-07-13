import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Phase 8B report assembly ─────────────────────────────────────
// One deterministic builder shared by the /reports page and the CSV
// export route, so the on-screen report and the exported file can
// never disagree on scoping or figures. Non-admins are hard-scoped
// to workshops they created (the /engagements ownership model).

export interface ReportTrainerRow {
  trainer_id:         string
  trainer_name:       string | null
  trainer_district:   string | null
  status:             string          // Pending Invite | Confirmed | Declined
  invited_at:         string | null
  responded_at:       string | null
  distance_km:        number | null
  transport_mode:     string | null
  est_cost_myr:       number | null
  actual_cost_myr:    number | null
  fit_suggestion:     string | null   // suitable | pending_review | not_matched
  fit_reason_en:      string | null
  fit_reason_bm:      string | null
  fit_classification: string | null   // + confirmed | declined
  fit_decided_at:     string | null
}

export interface ReportWorkshop {
  engagement_id:    string
  training_title:   string | null
  venue_name:       string | null
  start_date:       string | null
  end_date:         string | null
  trainers_needed:  number
  workflow_status:  string
  created_at:       string
  created_by:       string | null
  creator_name:     string | null
  creator_district: string | null
  target_skill_en:  string | null
  target_skill_bm:  string | null
  invitedCount:     number
  confirmedCount:   number
  pendingCount:     number
  declinedCount:    number
  estCostConfirmedMyr: number
  estCostInvitedMyr:   number
  trainers:         ReportTrainerRow[]
}

export interface ReportBuildResult {
  workshops: ReportWorkshop[]
  /** false = migration 025 not applied yet — fit columns unavailable */
  classificationAvailable: boolean
}

export async function buildReportWorkshops(
  admin: AdminClient,
  userId: string,
  isAdmin: boolean,
): Promise<ReportBuildResult> {
  // 1. Workshops, role-scoped
  let engQuery = admin
    .from('training_engagements')
    .select('engagement_id, training_title, target_item_id, dynamic_venue_name, venue_school_code, start_date, end_date, trainers_needed, workflow_status, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(500)
  if (!isAdmin) engQuery = engQuery.eq('created_by', userId)
  const { data: rawEngs } = await engQuery
  const engs = rawEngs ?? []
  const engIds = engs.map(e => e.engagement_id as string)

  // 2. Trainer invite rows — fit_* columns arrive with migration 025;
  // degrade gracefully if it hasn't been run yet.
  let inviteRows: Record<string, unknown>[] = []
  let classificationAvailable = true
  if (engIds.length > 0) {
    const full = await admin
      .from('engagement_trainers')
      .select('engagement_id, trainer_id, status, invited_at, responded_at, fit_suggestion, fit_reason_en, fit_reason_bm, fit_classification, fit_decided_at')
      .in('engagement_id', engIds)
    if (full.error) {
      classificationAvailable = false
      const basic = await admin
        .from('engagement_trainers')
        .select('engagement_id, trainer_id, status, invited_at, responded_at')
        .in('engagement_id', engIds)
      inviteRows = basic.data ?? []
    } else {
      inviteRows = full.data ?? []
    }
  }

  // 3. Trainer identities + districts
  const trainerIds = [...new Set(inviteRows.map(r => r.trainer_id as string))]
  const { data: trainers } = trainerIds.length > 0
    ? await admin.from('master_trainers').select('trainer_id, trainer_name, ppd_district').in('trainer_id', trainerIds)
    : { data: [] }
  const trainerMap = Object.fromEntries((trainers ?? []).map(t => [t.trainer_id as string, t]))

  // 4. Travel costs per (engagement, trainer) — the Phase 4 logs
  interface LogRow {
    engagement_id: string; trainer_id: string
    calculated_distance_km: number | null; suggested_transport_mode: string | null
    estimated_cost_myr: number | null; actual_cost_myr: number | null
  }
  const { data: logs } = engIds.length > 0
    ? await admin
        .from('travel_logs')
        .select('engagement_id, trainer_id, calculated_distance_km, suggested_transport_mode, estimated_cost_myr, actual_cost_myr')
        .in('engagement_id', engIds)
        .limit(5000)
    : { data: [] }
  const logMap: Record<string, LogRow> = {}
  for (const l of (logs ?? []) as unknown as LogRow[]) logMap[`${l.engagement_id}:${l.trainer_id}`] = l

  // 5. Creators (name + district) and venue-school names
  const creatorIds = [...new Set(engs.map(e => e.created_by as string | null).filter(Boolean) as string[])]
  const { data: creators } = creatorIds.length > 0
    ? await admin.from('profiles').select('user_id, full_name, ppd_district').in('user_id', creatorIds)
    : { data: [] }
  const creatorMap = Object.fromEntries((creators ?? []).map(c => [c.user_id as string, c]))

  const schoolCodes = [...new Set(engs.map(e => e.venue_school_code as string | null).filter(Boolean) as string[])]
  const { data: schools } = schoolCodes.length > 0
    ? await admin.from('schools').select('school_code, school_name').in('school_code', schoolCodes)
    : { data: [] }
  const schoolMap = Object.fromEntries((schools ?? []).map(s => [s.school_code as string, s.school_name as string]))

  // 6. Target skill names (bilingual)
  const itemIds = [...new Set(engs.map(e => e.target_item_id as number | null).filter(v => v != null) as number[])]
  const { data: items } = itemIds.length > 0
    ? await admin.from('skills_subjects').select('item_id, name_en, name_bm').in('item_id', itemIds)
    : { data: [] }
  const itemMap = Object.fromEntries((items ?? []).map(i => [i.item_id as number, i]))

  // 7. Assemble
  const byEng: Record<string, ReportTrainerRow[]> = {}
  for (const r of inviteRows) {
    const eid = r.engagement_id as string
    const tid = r.trainer_id as string
    const log = logMap[`${eid}:${tid}`]
    ;(byEng[eid] ??= []).push({
      trainer_id:         tid,
      trainer_name:       (trainerMap[tid]?.trainer_name as string | null) ?? null,
      trainer_district:   (trainerMap[tid]?.ppd_district as string | null) ?? null,
      status:             r.status as string,
      invited_at:         (r.invited_at as string | null) ?? null,
      responded_at:       (r.responded_at as string | null) ?? null,
      distance_km:        log?.calculated_distance_km ?? null,
      transport_mode:     log?.suggested_transport_mode ?? null,
      est_cost_myr:       log?.estimated_cost_myr ?? null,
      actual_cost_myr:    log?.actual_cost_myr ?? null,
      fit_suggestion:     (r.fit_suggestion as string | null) ?? null,
      fit_reason_en:      (r.fit_reason_en as string | null) ?? null,
      fit_reason_bm:      (r.fit_reason_bm as string | null) ?? null,
      fit_classification: (r.fit_classification as string | null) ?? null,
      fit_decided_at:     (r.fit_decided_at as string | null) ?? null,
    })
  }

  const workshops: ReportWorkshop[] = engs.map(e => {
    const eid = e.engagement_id as string
    const rows = (byEng[eid] ?? []).sort((a, b) => (a.trainer_name ?? '').localeCompare(b.trainer_name ?? ''))
    const uid  = e.created_by as string | null
    const item = e.target_item_id != null ? itemMap[e.target_item_id as number] : null
    const confirmedRows = rows.filter(r => r.status === 'Confirmed')
    const sum = (list: ReportTrainerRow[]) => Math.round(list.reduce((s, r) => s + (r.est_cost_myr ?? 0), 0))
    return {
      engagement_id:    eid,
      training_title:   (e.training_title as string | null) ?? null,
      venue_name:       (e.dynamic_venue_name as string | null)
                          ?? (e.venue_school_code ? schoolMap[e.venue_school_code as string] ?? null : null),
      start_date:       (e.start_date as string | null) ?? null,
      end_date:         (e.end_date as string | null) ?? null,
      trainers_needed:  (e.trainers_needed as number | null) ?? 1,
      workflow_status:  e.workflow_status as string,
      created_at:       e.created_at as string,
      created_by:       uid,
      creator_name:     uid ? (creatorMap[uid]?.full_name as string | null) ?? null : null,
      creator_district: uid ? (creatorMap[uid]?.ppd_district as string | null) ?? null : null,
      target_skill_en:  (item?.name_en as string | null) ?? null,
      target_skill_bm:  (item?.name_bm as string | null) ?? null,
      invitedCount:     rows.length,
      confirmedCount:   confirmedRows.length,
      pendingCount:     rows.filter(r => r.status === 'Pending Invite').length,
      declinedCount:    rows.filter(r => r.status === 'Declined').length,
      estCostConfirmedMyr: sum(confirmedRows),
      estCostInvitedMyr:   sum(rows),
      trainers:         rows,
    }
  })

  return { workshops, classificationAvailable }
}

// Filters shared by the client view and the export route (the export
// re-applies them server-side — it never trusts a client row list).
export interface ReportFilters {
  q?:         string
  date_from?: string
  date_to?:   string
  district?:  string
  status?:    string
  response?:  string
  /** engagement_id — pick one workshop from the dropdown instead of typing */
  workshop?:  string
}

export function applyReportFilters(workshops: ReportWorkshop[], f: ReportFilters): ReportWorkshop[] {
  const needle = (f.q ?? '').trim().toLowerCase()
  return workshops.filter(w => {
    if (f.workshop && w.engagement_id !== f.workshop) return false
    if (f.status && w.workflow_status !== f.status) return false
    if (f.district && w.creator_district !== f.district) return false
    if (f.response && !w.trainers.some(tr => tr.status === f.response)) return false
    if (f.date_from && (!w.start_date || w.start_date < f.date_from)) return false
    if (f.date_to && (!w.start_date || w.start_date > f.date_to)) return false
    if (needle) {
      const hay = [w.training_title, w.venue_name, w.creator_name, w.creator_district,
                   ...w.trainers.map(tr => tr.trainer_name)].join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}
