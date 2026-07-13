import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Cost-estimate accuracy rows ──────────────────────────────────
// One deterministic builder shared by the /admin/analytics page and
// the cost-export route (CSV/PDF for budget preparation), so the
// on-screen table and the downloaded file can never disagree.
// Rows are travel_logs entries for CONFIRMED (engagement, trainer)
// pairs only — the trips that actually happen and can ever be
// claimed against a budget.

export interface CostAccuracyRow {
  engagement_id:  string
  trainer_id:     string
  training_title: string | null
  venue_name:     string | null
  start_date:     string | null
  end_date:       string | null
  trainer_name:   string | null
  trainer_district: string | null
  distance_km:    number | null
  transport_mode: string | null
  cost_source:    string | null
  estimated_myr:  number | null
  actual_myr:     number | null
  actual_note:    string | null
}

export async function buildCostAccuracyRows(admin: AdminClient): Promise<CostAccuracyRow[]> {
  const [{ data: engagements }, { data: confirmedInvites }] = await Promise.all([
    admin
      .from('training_engagements')
      .select('engagement_id, training_title, workflow_status, start_date, end_date, dynamic_venue_name, venue_school_code')
      .limit(1000),
    admin
      .from('engagement_trainers')
      .select('engagement_id, trainer_id')
      .eq('status', 'Confirmed')
      .limit(5000),
  ])

  const engById = Object.fromEntries((engagements ?? []).map(e => [e.engagement_id as string, e]))
  const pairs = confirmedInvites ?? []
  const confirmedEngIds = [...new Set(pairs.map(i => i.engagement_id as string))]
  if (confirmedEngIds.length === 0) return []

  const trainerIds = [...new Set(pairs.map(i => i.trainer_id as string))]
  const schoolCodes = [...new Set(
    confirmedEngIds
      .map(id => engById[id]?.venue_school_code as string | null)
      .filter(Boolean) as string[]
  )]

  // Trainer names deliberately NOT filtered on deleted_at — a confirmed
  // historical trip must keep its trainer name even after a soft delete.
  const [{ data: logs }, { data: trainers }, { data: schools }] = await Promise.all([
    admin
      .from('travel_logs')
      .select('engagement_id, trainer_id, calculated_distance_km, suggested_transport_mode, cost_source, estimated_cost_myr, actual_cost_myr, actual_cost_note')
      .in('engagement_id', confirmedEngIds)
      .limit(2000),
    admin
      .from('master_trainers')
      .select('trainer_id, trainer_name, ppd_district')
      .in('trainer_id', trainerIds)
      .limit(5000),
    schoolCodes.length > 0
      ? admin.from('schools').select('school_code, school_name').in('school_code', schoolCodes)
      : Promise.resolve({ data: [] }),
  ])

  const trainerById = Object.fromEntries((trainers ?? []).map(tr => [tr.trainer_id as string, tr]))
  const schoolMap = Object.fromEntries((schools ?? []).map(s => [s.school_code as string, s.school_name as string]))
  const confirmedPairKeys = new Set(pairs.map(i => `${i.engagement_id}:${i.trainer_id}`))

  return (logs ?? [])
    .filter(l => confirmedPairKeys.has(`${l.engagement_id}:${l.trainer_id}`))
    .map(l => {
      const eng = engById[l.engagement_id as string]
      const tr  = trainerById[l.trainer_id as string]
      return {
        engagement_id:  l.engagement_id as string,
        trainer_id:     l.trainer_id as string,
        training_title: (eng?.training_title as string | null) ?? null,
        venue_name:     (eng?.dynamic_venue_name as string | null)
                          ?? (eng?.venue_school_code ? schoolMap[eng.venue_school_code as string] ?? null : null),
        start_date:     (eng?.start_date as string | null) ?? null,
        end_date:       (eng?.end_date as string | null) ?? null,
        trainer_name:   (tr?.trainer_name as string | null) ?? null,
        trainer_district: (tr?.ppd_district as string | null) ?? null,
        distance_km:    (l.calculated_distance_km as number | null) ?? null,
        transport_mode: (l.suggested_transport_mode as string | null) ?? null,
        cost_source:    (l.cost_source as string | null) ?? null,
        estimated_myr:  (l.estimated_cost_myr as number | null) ?? null,
        actual_myr:     (l.actual_cost_myr as number | null) ?? null,
        actual_note:    (l.actual_cost_note as string | null) ?? null,
      }
    })
    .sort((a, b) =>
      (b.start_date ?? '').localeCompare(a.start_date ?? '')
      || (a.training_title ?? '').localeCompare(b.training_title ?? '')
      || (a.trainer_name ?? '').localeCompare(b.trainer_name ?? '')
    )
}
