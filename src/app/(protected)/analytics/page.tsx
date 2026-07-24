import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations, isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import { CANONICAL_PPD_DISTRICTS, DESERT_THRESHOLD, canonicalizeDistrict } from '@/lib/districts'
import { buildCostAccuracyRows } from '@/lib/analyticsCost'
import {
  AnalyticsClient,
  type AnalyticsData,
  type DistrictCoverageRow,
} from './_components/AnalyticsClient'

export const dynamic = 'force-dynamic'

// Phase 8 — KPI / analytics dashboard. Every figure is computed here in
// deterministic code from the live tables (never by the LLM), then
// rendered by the client component. Open to every active user
// (2026-07-22): admins see statewide activity; non-admins see only the
// workshops they created — the trainer-pool + district-coverage panels
// stay statewide reference data for everyone (user decision). Scoping
// mirrors /reports (buildReportWorkshops): reads go through the
// service-role client, so the created_by filter IS the access boundary.
export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!currentProfile || currentProfile.status !== 'active') redirect('/awaiting-approval')
  const isAdmin = currentProfile.role === 'admin'

  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE
  const t = getTranslations(locale)

  const admin = createAdminClient()

  // ── Source data ────────────────────────────────────────────────
  // Activity tables are scoped to the caller's own workshops for
  // non-admins; the trainer pool stays statewide (reference data).
  let engQuery = admin
    .from('training_engagements')
    .select('engagement_id, training_title, workflow_status, created_at, start_date, end_date, trainers_needed')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (!isAdmin) engQuery = engQuery.eq('created_by', user.id)
  const { data: engagements } = await engQuery

  const engs = engagements ?? []
  const ownEngIds = engs.map(e => e.engagement_id as string)

  let inviteQuery = admin
    .from('engagement_trainers')
    .select('engagement_id, trainer_id, status, invited_at, responded_at')
    .limit(5000)
  if (!isAdmin) inviteQuery = inviteQuery.in('engagement_id', ownEngIds)

  const [{ data: invites }, { data: trainers }] = await Promise.all([
    inviteQuery,
    admin
      .from('master_trainers')
      .select('trainer_id, trainer_name, ppd_district')
      .is('deleted_at', null)
      .limit(5000),
  ])

  const inviteRows  = invites ?? []
  const trainerRows = trainers ?? []
  const engById     = Object.fromEntries(engs.map(e => [e.engagement_id as string, e]))

  // ── Overview ────────────────────────────────────────────────────
  const realWorkshops = engs.filter(e => e.workflow_status !== 'Draft')
  const confirmedWorkshops = engs.filter(e => e.workflow_status === 'Confirmed')

  const confirmedInvites = inviteRows.filter(i => i.status === 'Confirmed')
  const declinedInvites  = inviteRows.filter(i => i.status === 'Declined')
  const pendingInvites   = inviteRows.filter(i => i.status === 'Pending Invite')
  const respondedCount   = confirmedInvites.length + declinedInvites.length
  const acceptRatePct    = respondedCount > 0
    ? Math.round((confirmedInvites.length / respondedCount) * 100)
    : null

  // ── KPI: recommendation adoption ────────────────────────────────
  const invitedWorkshopIds = new Set(inviteRows.map(i => i.engagement_id as string))
  const staffedCount = engs.filter(e => {
    if (!invitedWorkshopIds.has(e.engagement_id as string)) return false
    const confirmed = inviteRows.filter(
      i => i.engagement_id === e.engagement_id && i.status === 'Confirmed'
    ).length
    return confirmed >= ((e.trainers_needed as number | null) ?? 1)
  }).length

  // ── KPI 3: overlapping confirmed bookings (should stay 0) ──────
  const confirmedByTrainer: Record<string, Array<{ start: string; end: string }>> = {}
  for (const i of confirmedInvites) {
    const eng = engById[i.engagement_id as string]
    if (!eng?.start_date || !eng?.end_date || eng.workflow_status === 'Cancelled') continue
    ;(confirmedByTrainer[i.trainer_id as string] ??= []).push({
      start: eng.start_date as string,
      end:   eng.end_date as string,
    })
  }
  let overlapCount = 0
  for (const list of Object.values(confirmedByTrainer)) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (list[a].start <= list[b].end && list[a].end >= list[b].start) overlapCount++
      }
    }
  }

  // ── KPI: cost-estimate accuracy ────────────────────────────────
  // Same builder feeds the CSV/PDF cost-export route so screen and
  // download always agree; scoped to owned workshops for non-admins.
  const costRows = await buildCostAccuracyRows(admin, isAdmin ? undefined : user.id)

  // ── KPI: talent-desert coverage per district (STATEWIDE) ────────
  const trainersByDistrict: Record<string, number> = {}
  for (const d of CANONICAL_PPD_DISTRICTS) trainersByDistrict[d] = 0
  for (const tr of trainerRows) {
    const d = canonicalizeDistrict(tr.ppd_district as string | null)
    if (!d) continue
    trainersByDistrict[d] += 1
  }
  const districtRows: DistrictCoverageRow[] = Object.entries(trainersByDistrict)
    .map(([district, count]) => ({ district, count, isDesert: count < DESERT_THRESHOLD }))
    .sort((a, b) => b.count - a.count)
  const coveredDistricts = districtRows.filter(d => d.count > 0).length
  const desertCount = districtRows.filter(d => d.isDesert).length

  const data: AnalyticsData = {
    overview: {
      activeTrainers:     trainerRows.length,
      totalWorkshops:     realWorkshops.length,
      confirmedWorkshops: confirmedWorkshops.length,
      invitesSent:        inviteRows.length,
      acceptRatePct,
      districtsCovered:   coveredDistricts,
      districtsTotal:     districtRows.length,
    },
    adoption: {
      confirmed: confirmedInvites.length,
      pending:   pendingInvites.length,
      declined:  declinedInvites.length,
      acceptRatePct,
      workshopsInvited: invitedWorkshopIds.size,
      workshopsStaffed: staffedCount,
    },
    overlaps: {
      overlapCount,
      trainersWithConfirmed: Object.keys(confirmedByTrainer).length,
    },
    cost: {
      rows: costRows,
    },
    coverage: {
      districts:       districtRows,
      desertCount,
      desertThreshold: DESERT_THRESHOLD,
    },
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate">{t.analytics.title}</h1>
        <p className="mt-1 text-sm text-muted">{isAdmin ? t.analytics.subtitle : t.analytics.subtitleUser}</p>
      </div>
      <AnalyticsClient data={data} scoped={!isAdmin} />
    </div>
  )
}
