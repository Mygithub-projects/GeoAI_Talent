// Trainer engagement limit (migration 030): at most N confirmed workshops per
// calendar year, N from app_settings. SOFT warning only — nothing here may
// ever block an invitation. Every reader is best-effort: if migration 030
// isn't applied, or a query fails, callers get null and simply show no badge.
//
// No server-only imports, so the types and limitLevel() are usable from
// client components too.
import type { SupabaseClient } from '@supabase/supabase-js'

export const ENGAGEMENT_LIMIT_KEY = 'trainer_max_engagements_per_year'
// Only used if the app_settings row is missing — the setting is the source of truth
const FALLBACK_LIMIT = 21
// "Near limit" (amber) starts this many workshops below the limit
export const NEAR_LIMIT_MARGIN = 2

export interface EngagementCount {
  year:      number
  confirmed: number
  pending:   number
  limit:     number
}

export type LimitLevel = 'ok' | 'near' | 'reached'

export function limitLevel(c: Pick<EngagementCount, 'confirmed' | 'limit'>): LimitLevel {
  if (c.confirmed >= c.limit) return 'reached'
  if (c.confirmed >= c.limit - NEAR_LIMIT_MARGIN) return 'near'
  return 'ok'
}

/** Calendar year of a YYYY-MM-DD date; null if it isn't one */
export function yearOf(date: string | null | undefined): number | null {
  const y = Number(date?.slice(0, 4))
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null
}

export async function getEngagementLimit(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from('app_settings')
    .select('value_int')
    .eq('setting_key', ENGAGEMENT_LIMIT_KEY)
    .maybeSingle()
  if (error || !data) return FALLBACK_LIMIT
  return Number(data.value_int) || FALLBACK_LIMIT
}

/**
 * Confirmed/pending counts for each trainer in `year`. Trainers with no
 * workshops that year get zeros. Returns null when the counts can't be
 * read (e.g. migration 030 not applied) — callers then show nothing.
 * `db` must be the CALLER's client: the function checks the caller is active.
 */
export async function getEngagementCounts(
  db: SupabaseClient,
  trainerIds: string[],
  year: number,
  excludeEngagementId: string | null = null,
): Promise<Map<string, EngagementCount> | null> {
  if (trainerIds.length === 0) return new Map()
  const [limit, { data, error }] = await Promise.all([
    getEngagementLimit(db),
    db.rpc('fn_trainer_engagement_summary', {
      p_trainer_ids:           trainerIds,
      p_year:                  year,
      p_exclude_engagement_id: excludeEngagementId,
    }),
  ])
  if (error) {
    console.error('[engagementLimit] summary', error.code ?? error.message)
    return null
  }
  const rows = new Map<string, { confirmed: number; pending: number }>()
  for (const r of (data ?? []) as Array<{ trainer_id: string; confirmed_count: number; pending_count: number }>) {
    rows.set(r.trainer_id, { confirmed: Number(r.confirmed_count), pending: Number(r.pending_count) })
  }
  return new Map(trainerIds.map(id => [
    id,
    { year, limit, confirmed: rows.get(id)?.confirmed ?? 0, pending: rows.get(id)?.pending ?? 0 },
  ]))
}
