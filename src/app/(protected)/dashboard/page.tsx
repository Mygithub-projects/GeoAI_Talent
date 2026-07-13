import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardMap } from './_components/DashboardMap'

// Sarawak statewide defaults
const SARAWAK_CENTER: [number, number] = [2.55, 113.8]
const SARAWAK_ZOOM = 7
const DISTRICT_ZOOM = 10

export default async function DashboardPage() {
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

  return (
    <DashboardMap
      skills={skills}
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      initialDistrictName={initialDistrictName}
    />
  )
}
