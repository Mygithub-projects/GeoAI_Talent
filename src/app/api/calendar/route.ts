import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Workshop calendar feed ───────────────────────────────────────
// Returns non-Cancelled engagements whose dates overlap the requested
// month, with per-trainer invite statuses. Scoped like /engagements
// and /reports (user decision 2026-07-12, replacing the original
// "visible to all" rule): admins see every workshop, non-admins only
// the ones they created. Reads via the admin client after the auth
// check, so this scoping is the actual access boundary.

export interface CalendarTrainer {
  trainer_id:   string
  trainer_name: string
  status:       string
}

export interface CalendarEngagement {
  engagement_id:   string
  training_title:  string | null
  venue_name:      string
  start_date:      string
  end_date:        string
  workflow_status: string
  trainers_needed: number
  confirmed_count: number
  created_by:      string | null
  trainers:        CalendarTrainer[]
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role')
    .eq('user_id', user.id)
    .single()
  if (profile?.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const isAdmin = profile.role === 'admin'

  const sp    = req.nextUrl.searchParams
  const year  = parseInt(sp.get('year')  ?? '', 10)
  const month = parseInt(sp.get('month') ?? '', 10) // 1-12
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year and month (1-12) are required' }, { status: 400 })
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const monthStart = `${year}-${pad(month)}-01`
  const lastDay    = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthEnd   = `${year}-${pad(month)}-${pad(lastDay)}`

  const admin = createAdminClient()

  // Engagements overlapping the month (standard interval-overlap test)
  let engQuery = admin
    .from('training_engagements')
    .select('engagement_id, training_title, dynamic_venue_name, venue_school_code, start_date, end_date, workflow_status, trainers_needed, created_by')
    .neq('workflow_status', 'Cancelled')
    .not('start_date', 'is', null)
    .not('end_date',   'is', null)
    .lte('start_date', monthEnd)
    .gte('end_date',   monthStart)
    .order('start_date', { ascending: true })
    .limit(300)
  if (!isAdmin) engQuery = engQuery.eq('created_by', user.id)
  const { data: engagements, error } = await engQuery

  if (error) {
    console.error('[calendar] query error', error)
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })
  }

  const rows = engagements ?? []
  const engagementIds = rows.map(e => e.engagement_id as string)

  // Per-engagement invited trainers + statuses
  const trainersByEngagement = new Map<string, CalendarTrainer[]>()
  if (engagementIds.length) {
    const { data: ets } = await admin
      .from('engagement_trainers')
      .select('engagement_id, trainer_id, status')
      .in('engagement_id', engagementIds)

    const trainerIds = [...new Set((ets ?? []).map(r => r.trainer_id as string))]
    const nameById = new Map<string, string>()
    if (trainerIds.length) {
      const { data: trainers } = await admin
        .from('master_trainers')
        .select('trainer_id, trainer_name')
        .in('trainer_id', trainerIds)
      for (const t of trainers ?? []) nameById.set(t.trainer_id as string, t.trainer_name as string)
    }
    for (const r of ets ?? []) {
      const list = trainersByEngagement.get(r.engagement_id as string) ?? []
      list.push({
        trainer_id:   r.trainer_id as string,
        trainer_name: nameById.get(r.trainer_id as string) ?? r.trainer_id as string,
        status:       r.status as string,
      })
      trainersByEngagement.set(r.engagement_id as string, list)
    }
  }

  // Venue names: dynamic name wins, registry school name as fallback
  const schoolCodes = [...new Set(rows.map(e => e.venue_school_code as string | null).filter(Boolean))] as string[]
  const schoolNameByCode = new Map<string, string>()
  if (schoolCodes.length) {
    const { data: schools } = await admin
      .from('schools')
      .select('school_code, school_name')
      .in('school_code', schoolCodes)
    for (const s of schools ?? []) schoolNameByCode.set(s.school_code as string, s.school_name as string)
  }

  const result: CalendarEngagement[] = rows.map(e => {
    const trainers = trainersByEngagement.get(e.engagement_id as string) ?? []
    return {
      engagement_id:   e.engagement_id as string,
      training_title:  e.training_title as string | null,
      venue_name:      (e.dynamic_venue_name as string | null)
                        ?? schoolNameByCode.get(e.venue_school_code as string)
                        ?? 'TBC',
      start_date:      e.start_date as string,
      end_date:        e.end_date as string,
      workflow_status: e.workflow_status as string,
      trainers_needed: (e.trainers_needed as number) ?? 1,
      confirmed_count: trainers.filter(t => t.status === 'Confirmed').length,
      created_by:      e.created_by as string | null,
      trainers,
    }
  })

  return NextResponse.json({ engagements: result, year, month })
}
