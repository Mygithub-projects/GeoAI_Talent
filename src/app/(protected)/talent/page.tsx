import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TalentClient } from './_components/TalentClient'

export const dynamic = 'force-dynamic'

const SARAWAK_CENTER: [number, number] = [2.55, 113.8]
const SARAWAK_ZOOM = 7
const DISTRICT_ZOOM = 10

// Phase 8A — Talent Distribution view. An additive analytics extension
// of the Mode A dashboard: same heatmap/pins infrastructure, plus
// per-district coverage badges (talent deserts / congestion), richer
// filters, and an admin-only workstation-transfer workflow. Visible to
// every active user (the same open-read model as the dashboard);
// non-admins start centred on their own district like Mode A.
export default async function TalentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, ppd_district')
    .eq('user_id', user.id)
    .single()
  if (!profile || profile.status !== 'active') redirect('/awaiting-approval')
  const isAdmin = profile.role === 'admin'

  const { data: skillsData } = await supabase
    .from('skills_subjects')
    .select('item_id, type, name_en, name_bm')
    .is('deleted_at', null)
    .order('type')
    .order('name_en')

  // Default camera — mirror the dashboard's Mode A behaviour
  let initialCenter: [number, number] = SARAWAK_CENTER
  let initialZoom = SARAWAK_ZOOM
  if (profile.ppd_district && profile.ppd_district !== 'STATEWIDE' && !isAdmin) {
    const { data: centroidRaw } = await supabase
      .rpc('fn_district_centroid', { p_district: profile.ppd_district })
      .single()
    const centroid = centroidRaw as { lat: number; lng: number } | null
    if (centroid?.lat && centroid?.lng) {
      initialCenter = [centroid.lat, centroid.lng]
      initialZoom = DISTRICT_ZOOM
    }
  }

  return (
    <TalentClient
      skills={skillsData ?? []}
      isAdmin={isAdmin}
      initialCenter={initialCenter}
      initialZoom={initialZoom}
    />
  )
}
