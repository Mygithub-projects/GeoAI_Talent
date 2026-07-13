import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
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
// DESERT_THRESHOLD now lives in src/lib/districts.ts (shared with /talent)

// Phase 8 — KPI / analytics dashboard, instrumented to the proposal's
// KPIs. Every figure on this page is computed here in deterministic
// code from the live tables (never by the LLM), then rendered by the
// client component. Admin-only.
export default async function AdminAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()

  if (currentProfile?.role !== 'admin' || currentProfile?.status !== 'active') {
    redirect('/dashboard')
  }

  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE
  const t = getTranslations(locale)

  const admin = createAdminClient()

  // ── Source data (small tables — whole-table reads are fine) ────
  const [{ data: engagements }, { data: invites }, { data: trainers }] = await Promise.all([
    admin
      .from('training_engagements')
      .select('engagement_id, training_title, workflow_status, created_at, start_date, end_date, trainers_needed')
      .order('created_at', { ascending: false })
      .limit(1000),
    admin
      .from('engagement_trainers')
      .select('engagement_id, trainer_id, status, invited_at, responded_at')
      .limit(5000),
    admin
      .from('master_trainers')
      .select('trainer_id, trainer_name, ppd_district')
      .is('deleted_at', null)
      .limit(5000),
  ])

  const engs      = engagements ?? []
  const inviteRows = invites ?? []
  const trainerRows = trainers ?? []
  const engById   = Object.fromEntries(engs.map(e => [e.engagement_id as string, e]))

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

  // ── KPI: cost-estimate accuracy (needs actuals from claims) ────
  // Shared builder (src/lib/analyticsCost.ts) — also feeds the CSV/PDF
  // cost-export route so the screen and the download always agree.
  // Accuracy/MAE/total tiles are computed client-side from these rows
  // so they follow the workshop filter and live actual-cost edits.
  const costRows = await buildCostAccuracyRows(admin)

  // ── KPI: talent-desert coverage per district ────────────────────
  // Coverage counts against the canonical 30 PPD districts only —
  // spelling variants are merged and junk values ('-') ignored, so a
  // data typo can never surface as an extra "covered" district.
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
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-sm">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={160} height={36} className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{currentProfile.full_name ?? user.email} · Admin</span>
          <Link href="/admin/users" className="text-sm text-royal-blue hover:underline">{t.admin.usersTitle}</Link>
          <Link href="/admin/database" className="text-sm text-royal-blue hover:underline">{t.adminDb.title}</Link>
          <Link href="/admin/audit" className="text-sm text-royal-blue hover:underline">{t.audit.title}</Link>
          <Link href="/dashboard" className="text-sm text-royal-blue hover:underline">{t.dashboard.title}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate">{t.analytics.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.analytics.subtitle}</p>
        </div>
        <AnalyticsClient data={data} />
      </main>
    </div>
  )
}
