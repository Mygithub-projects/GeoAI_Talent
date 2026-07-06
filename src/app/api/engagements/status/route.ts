import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEngagementAccess } from '@/lib/engagementAuth'

// Live per-trainer accept/decline status for one engagement — used by the
// dashboard map's RecommendationPanel so the admin/user can see outcomes
// without navigating to the /engagements Backlog page.
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

  const { data: engagement, error: engErr } = await admin
    .from('training_engagements')
    .select('trainers_needed')
    .eq('engagement_id', engagementId)
    .single()

  if (engErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }

  const { data: rows } = await admin
    .from('engagement_trainers')
    .select('trainer_id, status, invited_at, responded_at')
    .eq('engagement_id', engagementId)
    .order('invited_at', { ascending: true })

  const trainerIds = [...new Set((rows ?? []).map(r => r.trainer_id as string))]
  const { data: trainers } = trainerIds.length > 0
    ? await admin.from('master_trainers').select('trainer_id, trainer_name').in('trainer_id', trainerIds)
    : { data: [] }

  const nameMap = Object.fromEntries(
    (trainers ?? []).map((t: { trainer_id: string; trainer_name: string | null }) => [t.trainer_id, t.trainer_name])
  )

  const trainerStatuses = (rows ?? []).map(r => ({
    trainer_id:   r.trainer_id as string,
    trainer_name: nameMap[r.trainer_id as string] ?? 'Unknown',
    status:       r.status as 'Pending Invite' | 'Confirmed' | 'Declined',
    invited_at:   r.invited_at as string,
    responded_at: (r.responded_at as string | null) ?? null,
  }))

  return NextResponse.json({
    trainers_needed: engagement.trainers_needed as number,
    confirmed_count: trainerStatuses.filter(t => t.status === 'Confirmed').length,
    trainers: trainerStatuses,
  })
}
