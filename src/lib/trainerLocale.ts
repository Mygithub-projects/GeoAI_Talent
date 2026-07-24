import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type EmailLocale = 'en' | 'bm'

// Per-invitation email language, stored on engagement_trainers.locale
// (migration 028). Reads are DEFENSIVE: if 028 hasn't been applied yet
// the column is missing and the query errors — we swallow it and fall
// back to 'bm' (the historical default) so every email flow keeps
// working. Same graceful-degradation pattern as the pre-025 fit columns.

const norm = (v: unknown): EmailLocale => (v === 'en' ? 'en' : 'bm')

// All trainers on one engagement → Map<trainer_id, locale>. Trainers
// absent from the map (or the whole map when 028 is missing) default
// to 'bm' at the call site via `?? 'bm'`.
export async function getTrainerLocales(
  admin: AdminClient,
  engagementId: string,
): Promise<Map<string, EmailLocale>> {
  const map = new Map<string, EmailLocale>()
  const { data, error } = await admin
    .from('engagement_trainers')
    .select('trainer_id, locale')
    .eq('engagement_id', engagementId)
  if (error || !data) return map
  for (const r of data) map.set(r.trainer_id as string, norm((r as { locale?: string }).locale))
  return map
}

// A set of engagement_trainers rows (by primary-key id) → Map<id, locale>.
// Used by the feedback cron, whose eligibility RPC returns the row id.
export async function getLocalesByRowId(
  admin: AdminClient,
  rowIds: string[],
): Promise<Map<string, EmailLocale>> {
  const map = new Map<string, EmailLocale>()
  if (rowIds.length === 0) return map
  const { data, error } = await admin
    .from('engagement_trainers')
    .select('id, locale')
    .in('id', rowIds)
  if (error || !data) return map
  for (const r of data) map.set(r.id as string, norm((r as { locale?: string }).locale))
  return map
}

// One (engagement, trainer) pair → locale, default 'bm'.
export async function getTrainerLocale(
  admin: AdminClient,
  engagementId: string,
  trainerId: string,
): Promise<EmailLocale> {
  const { data, error } = await admin
    .from('engagement_trainers')
    .select('locale')
    .eq('engagement_id', engagementId)
    .eq('trainer_id', trainerId)
    .maybeSingle()
  if (error || !data) return 'bm'
  return norm((data as { locale?: string }).locale)
}
