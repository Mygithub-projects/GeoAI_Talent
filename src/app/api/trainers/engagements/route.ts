import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEngagementLimit } from '@/lib/engagementLimit'

// One trainer's workshops in one calendar year + their count vs the
// engagement limit (migration 030). Every active user sees every
// coordinator's workshop titles — user decision 2026-10-14, so a trainer's
// overall load is visible to whoever is about to book them.

export interface EngagementHistoryItem {
  engagement_id:  string
  training_title: string | null
  venue:          string | null
  start_date:     string | null
  end_date:       string | null
  trainer_status: 'Confirmed' | 'Pending Invite'
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trainerId = req.nextUrl.searchParams.get('trainer_id')?.trim() ?? ''
  const year      = Number(req.nextUrl.searchParams.get('year'))
  if (!trainerId || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'trainer_id and year are required' }, { status: 400 })
  }

  // The function itself checks the caller is an active user
  const [limit, { data, error }] = await Promise.all([
    getEngagementLimit(supabase),
    supabase.rpc('fn_trainer_engagement_history', { p_trainer_id: trainerId, p_year: year }),
  ])
  if (error) {
    // e.g. migration 030 not applied yet — the UI hides the section
    console.error('[trainers/engagements]', error.code ?? error.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  const items = (data ?? []) as EngagementHistoryItem[]
  return NextResponse.json({
    year,
    limit,
    confirmed: items.filter(i => i.trainer_status === 'Confirmed').length,
    pending:   items.filter(i => i.trainer_status === 'Pending Invite').length,
    items,
  })
}
