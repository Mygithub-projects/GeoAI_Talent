import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { getEngagementSnapshot, type EngagementSnapshot } from '@/lib/engagementSnapshot'
import { DashboardMap } from './_components/DashboardMap'

// Sarawak statewide defaults
const SARAWAK_CENTER: [number, number] = [2.55, 113.8]
const SARAWAK_ZOOM = 7
const DISTRICT_ZOOM = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DashboardPage({
  searchParams,
}: {
  // ?engagement=<id> — opened from the Calendar's Invite button: reopen that
  // existing workshop on the search screen (access is checked by the API)
  searchParams: Promise<{ engagement?: string }>
}) {
  const { engagement } = await searchParams
  const initialEngagementId = engagement && UUID_RE.test(engagement) ? engagement : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ppd_district, status')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/awaiting-approval')

  // Fetch skills and subjects for the selector dropdown
  const { data: skillsData } = await supabase
    .from('skills_subjects')
    .select('item_id, type, name_en, name_bm')
    .is('deleted_at', null)
    .order('type')
    .order('name_en')

  const skills = skillsData ?? []

  // Determine initial map view
  let initialCenter: [number, number] = SARAWAK_CENTER
  let initialZoom = SARAWAK_ZOOM
  let initialDistrictName: string | null = null

  // Non-admin users with a specific district: zoom to their district centroid.
  // Statewide (state officer) users fall through to the statewide default, like admins.
  if (profile.ppd_district && profile.ppd_district !== 'STATEWIDE' && profile.role !== 'admin') {
    const { data: centroidRaw } = await supabase
      .rpc('fn_district_centroid', { p_district: profile.ppd_district })
      .single()

    const centroid = centroidRaw as { lat: number; lng: number } | null
    if (centroid?.lat && centroid?.lng) {
      initialCenter = [centroid.lat, centroid.lng]
      initialZoom = DISTRICT_ZOOM
      initialDistrictName = profile.ppd_district
    }
  }

  // Calendar → Invite: load the workshop HERE, before the page is drawn, so
  // the map opens straight at the venue with the panel filled in. Loading it
  // client-side meant a statewide map, a round trip, then a fly-in across
  // six zoom levels (~245 map tiles of grey/white squares; 2026-11-06).
  let initialWorkshop: EngagementSnapshot | null = null
  let initialWorkshopFailed = false
  if (initialEngagementId) {
    const admin  = createAdminClient()
    const access = await checkEngagementAccess(admin, initialEngagementId, user.id, profile.role)
    const snap   = access.ok ? await getEngagementSnapshot(admin, initialEngagementId) : null
    const e      = snap?.engagement
    if (snap && e && e.venue_lat != null && e.venue_long != null && e.start_date && e.end_date) {
      initialWorkshop = snap
    } else {
      initialWorkshopFailed = true
    }
  }

  return (
    <DashboardMap
      skills={skills}
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      initialDistrictName={initialDistrictName}
      initialWorkshop={initialWorkshop}
      initialWorkshopFailed={initialWorkshopFailed}
    />
  )
}
