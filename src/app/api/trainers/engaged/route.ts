import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Phase 8A — trainer IDs with a non-declined invite on any non-Cancelled
// workshop overlapping the given date range. Powers the optional
// date-range filter on the Talent Distribution view (show trainers
// available vs engaged in a window). Returns ONLY trainer IDs — no
// workshop details — the same information the availability search
// already implies, so it is open to every active user. Reads via the
// admin client after the auth check (engagement_trainers RLS is
// admin/creator-scoped).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('user_id', user.id)
    .single()
  if (profile?.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp   = req.nextUrl.searchParams
  const from = sp.get('date_from') ?? ''
  const to   = sp.get('date_to') ?? ''
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: 'date_from and date_to (YYYY-MM-DD, from ≤ to) are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Workshops overlapping the window (standard interval-overlap test)
  const { data: engs, error: engErr } = await admin
    .from('training_engagements')
    .select('engagement_id')
    .neq('workflow_status', 'Cancelled')
    .not('start_date', 'is', null)
    .not('end_date',   'is', null)
    .lte('start_date', to)
    .gte('end_date',   from)
    .limit(1000)
  if (engErr) {
    console.error('[trainers/engaged]', engErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const engagementIds = (engs ?? []).map(e => e.engagement_id as string)
  if (engagementIds.length === 0) return NextResponse.json({ engaged: [] })

  const { data: ets, error: etErr } = await admin
    .from('engagement_trainers')
    .select('trainer_id')
    .in('engagement_id', engagementIds)
    .neq('status', 'Declined')
  if (etErr) {
    console.error('[trainers/engaged]', etErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const engaged = [...new Set((ets ?? []).map(r => r.trainer_id as string))]
  return NextResponse.json({ engaged })
}
