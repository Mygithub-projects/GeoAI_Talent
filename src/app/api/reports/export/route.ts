import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReportWorkshops, applyReportFilters, type ReportFilters } from '@/lib/reportData'

// Phase 8B — CSV export of the report. Generated SERVER-SIDE so the
// role scoping can never be bypassed (non-admins only ever export
// workshops they created) and so the export itself is audit-logged.
// Filters arrive as query params and are re-applied here via the same
// applyReportFilters the on-screen view uses — the file always matches
// what the user saw. Column headers are stable snake_case identifiers
// (a data schema, deliberately not localized); status/classification
// values are the raw enum strings for analysis fidelity.

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const HEADERS = [
  'workshop_ref', 'training_title', 'venue', 'target_skill', 'start_date', 'end_date',
  'workshop_status', 'created_by', 'creator_district', 'trainers_needed',
  'invited_total', 'accepted_total', 'pending_total', 'declined_total',
  'est_cost_confirmed_myr', 'est_cost_invited_myr',
  'trainer_id', 'trainer_name', 'trainer_district', 'invite_status',
  'invited_at', 'responded_at', 'distance_km', 'transport_mode',
  'trainer_est_cost_myr', 'trainer_actual_cost_myr',
  'ai_suggestion', 'classification',
]

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const isAdmin = profile.role === 'admin'

  const sp = req.nextUrl.searchParams
  const filters: ReportFilters = {
    q:         sp.get('q') ?? undefined,
    workshop:  sp.get('workshop') ?? undefined,
    date_from: sp.get('date_from') ?? undefined,
    date_to:   sp.get('date_to') ?? undefined,
    district:  isAdmin ? (sp.get('district') ?? undefined) : undefined,
    status:    sp.get('status') ?? undefined,
    response:  sp.get('response') ?? undefined,
  }

  const admin = createAdminClient()
  const { workshops } = await buildReportWorkshops(admin, user.id, isAdmin)
  const filtered = applyReportFilters(workshops, filters)

  const lines: string[] = [HEADERS.join(',')]
  let rowCount = 0
  for (const w of filtered) {
    const base = [
      w.engagement_id.slice(0, 8), w.training_title, w.venue_name, w.target_skill_en,
      w.start_date, w.end_date, w.workflow_status, w.creator_name, w.creator_district,
      w.trainers_needed, w.invitedCount, w.confirmedCount, w.pendingCount, w.declinedCount,
      w.estCostConfirmedMyr, w.estCostInvitedMyr,
    ]
    if (w.trainers.length === 0) {
      lines.push([...base, '', '', '', '', '', '', '', '', '', '', '', ''].map(csvEscape).join(','))
      rowCount++
    } else {
      for (const tr of w.trainers) {
        lines.push([
          ...base,
          tr.trainer_id, tr.trainer_name, tr.trainer_district, tr.status,
          tr.invited_at, tr.responded_at, tr.distance_km, tr.transport_mode,
          tr.est_cost_myr, tr.actual_cost_myr,
          tr.fit_suggestion, tr.fit_classification,
        ].map(csvEscape).join(','))
        rowCount++
      }
    }
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'report.export',
    entity_type:  'report',
    entity_id:    'csv',
    payload_json: {
      filters,
      workshop_count: filtered.length,
      row_count:      rowCount,
      scope:          isAdmin ? 'all' : 'mine',
      actor_name:     profile.full_name ?? null,
    },
  })

  const today = new Date().toISOString().slice(0, 10)
  // Leading U+FEFF (UTF-8 BOM) so Excel opens the file with correct encoding
  const csv = '﻿' + lines.join('\r\n') + '\r\n'
  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="geoai-talent-report-${today}.csv"`,
      'Cache-Control':       'no-store',
    },
  })
}
