import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'
import { getEngagementSnapshot } from '@/lib/engagementSnapshot'

// Live per-trainer accept/decline status for one engagement — used by the
// dashboard map's RecommendationPanel so the admin/user can see outcomes
// without navigating to the /engagements Backlog page. Also returns the
// workshop's own details so the Calendar's Invite button can reopen it on
// the search screen (/dashboard?engagement=<id>, 2026-11-06).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const engagementId = req.nextUrl.searchParams.get('engagement_id')
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single()

  const admin = createAdminClient()

  const access = await checkEngagementAccess(admin, engagementId, user.id, profile?.role)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const snapshot = await getEngagementSnapshot(admin, engagementId)
  if (!snapshot) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  return NextResponse.json(snapshot)
}
