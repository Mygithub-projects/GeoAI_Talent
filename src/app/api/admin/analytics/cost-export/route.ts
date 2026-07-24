import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCostAccuracyRows, type CostAccuracyRow } from '@/lib/analyticsCost'

// Cost-estimation report export (CSV or PDF) from the analytics
// dashboard — per-participant travel-cost estimates vs actuals for
// confirmed bookings, optionally scoped to one workshop/programme.
// Intended for preparing a workshop budget. Generated SERVER-SIDE via
// the same builder as the on-screen table (the file always matches
// the screen) and audit-logged like the Phase 8B report export.
// Headers/labels are stable English identifiers (a data schema,
// deliberately not localized — same decision as /api/reports/export).

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_HEADERS = [
  'workshop_ref', 'training_title', 'venue', 'start_date', 'end_date',
  'trainer_id', 'trainer_name', 'trainer_district', 'transport_mode',
  'distance_km', 'cost_source', 'estimated_cost_myr', 'actual_cost_myr',
  'variance_pct', 'actual_cost_note',
]

const fmtMyr = (v: number | null) =>
  v != null ? v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

const variancePct = (r: CostAccuracyRow): number | null =>
  r.actual_myr != null && r.estimated_myr != null && r.estimated_myr > 0
    ? Math.round(((r.actual_myr - r.estimated_myr) / r.estimated_myr) * 100)
    : null

function buildCsv(rows: CostAccuracyRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')]
  for (const r of rows) {
    const vp = variancePct(r)
    lines.push([
      r.engagement_id.slice(0, 8), r.training_title, r.venue_name, r.start_date, r.end_date,
      r.trainer_id, r.trainer_name, r.trainer_district, r.transport_mode,
      r.distance_km, r.cost_source, r.estimated_myr, r.actual_myr,
      vp != null ? vp : '', r.actual_note,
    ].map(csvEscape).join(','))
  }
  // Leading U+FEFF (UTF-8 BOM) so Excel opens the file with correct encoding
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function buildPdf(rows: CostAccuracyRow[], scopeLabel: string, generatedAt: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const NAVY = '#0E2F57'

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(NAVY)
  doc.text('GeoAI Talent Agent — Cost Estimation Report', 14, 16)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#475569')
  doc.text(`Scope: ${scopeLabel}`, 14, 23)
  doc.text(`Generated: ${generatedAt}`, pageW - 14, 23, { align: 'right' })

  let y = 30

  // Group participant rows per workshop so each programme reads as its
  // own budget block with a subtotal.
  const groups = new Map<string, CostAccuracyRow[]>()
  for (const r of rows) {
    const list = groups.get(r.engagement_id) ?? []
    list.push(r)
    groups.set(r.engagement_id, list)
  }

  for (const [, group] of groups) {
    const first = group[0]
    const estSubtotal    = group.reduce((s, r) => s + (r.estimated_myr ?? 0), 0)
    const actualSubtotal = group.reduce((s, r) => s + (r.actual_myr ?? 0), 0)
    const hasActuals     = group.some(r => r.actual_myr != null)

    if (y > doc.internal.pageSize.getHeight() - 45) {
      doc.addPage()
      y = 16
    }

    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(NAVY)
    doc.text(first.training_title ?? `Workshop ${first.engagement_id.slice(0, 8)}`, 14, y)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor('#475569')
    const meta = [
      first.venue_name ? `Venue: ${first.venue_name}` : null,
      first.start_date ? `Dates: ${first.start_date}${first.end_date && first.end_date !== first.start_date ? ` – ${first.end_date}` : ''}` : null,
      `Confirmed participants: ${group.length}`,
    ].filter(Boolean).join('    ·    ')
    // Long venue names must wrap, or the dates/participants run off the page
    const metaLines: string[] = doc.splitTextToSize(meta, pageW - 28)
    doc.text(metaLines, 14, y + 5)

    autoTable(doc, {
      startY: y + 5 + metaLines.length * 3.8,
      head: [[ '#', 'Trainer', 'District', 'Mode', 'Distance (km)', 'Source', 'Estimated (RM)', 'Actual (RM)', 'Variance' ]],
      body: group.map((r, i) => {
        const vp = variancePct(r)
        return [
          String(i + 1),
          r.trainer_name ?? r.trainer_id,
          r.trainer_district ?? '—',
          r.transport_mode ?? '—',
          r.distance_km != null ? String(r.distance_km) : '—',
          r.cost_source ?? '—',
          fmtMyr(r.estimated_myr),
          fmtMyr(r.actual_myr),
          vp != null ? `${vp > 0 ? '+' : ''}${vp}%` : '—',
        ]
      }),
      foot: [[
        { content: `Subtotal — estimated budget`, colSpan: 6, styles: { halign: 'right' as const } },
        fmtMyr(estSubtotal),
        hasActuals ? fmtMyr(actualSubtotal) : '—',
        '',
      ]],
      theme: 'grid',
      styles:     { font: 'helvetica', fontSize: 8, textColor: '#15233A', lineColor: '#E2E8F0', lineWidth: 0.1, cellPadding: 1.6 },
      headStyles: { fillColor: NAVY, textColor: '#FFFFFF', fontStyle: 'bold' },
      footStyles: { fillColor: '#F6F8FB', textColor: NAVY, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'right', cellWidth: 8 }, 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // Grand total across the exported scope
  const grandEst    = rows.reduce((s, r) => s + (r.estimated_myr ?? 0), 0)
  const grandActual = rows.reduce((s, r) => s + (r.actual_myr ?? 0), 0)
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage()
    y = 16
  }
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(NAVY)
  doc.text(
    `Grand total — estimated: RM ${fmtMyr(grandEst)}${rows.some(r => r.actual_myr != null) ? `    ·    actual recorded: RM ${fmtMyr(grandActual)}` : ''}`,
    14, y
  )
  doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor('#64748B')
  doc.text(
    'Travel cost estimates are indicative and for budget-planning reference only. Figures derive from standard government rate schedules and available route data at the time of search.',
    14, y + 6
  )
  doc.text(
    'Actual costs may vary — verify with the relevant finance or logistics officer and obtain required approvals before committing any expenditure.',
    14, y + 10
  )

  return doc.output('arraybuffer')
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()
  // Open to any active user (same as the /analytics page); non-admins
  // are scoped to their own workshops so the file matches their screen.
  if (profile?.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const isAdmin = profile.role === 'admin'

  const sp = req.nextUrl.searchParams
  const format = sp.get('format') === 'pdf' ? 'pdf' : 'csv'
  const engagementId = sp.get('engagement_id')

  const admin = createAdminClient()
  let rows = await buildCostAccuracyRows(admin, isAdmin ? undefined : user.id)
  if (engagementId) rows = rows.filter(r => r.engagement_id === engagementId)

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'analytics.cost_export',
    entity_type:  'report',
    entity_id:    format,
    payload_json: {
      format,
      engagement_id: engagementId ?? 'all',
      row_count:     rows.length,
      scope:         isAdmin ? 'all' : 'mine',
      actor_name:    profile.full_name ?? null,
    },
  })

  const today = new Date().toISOString().slice(0, 10)
  const filename = `geoai-cost-estimation-${today}.${format}`

  if (format === 'pdf') {
    const scopeLabel = engagementId
      ? (rows[0]?.training_title ?? `Workshop ${engagementId.slice(0, 8)}`)
      : 'All workshops'
    const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    const pdf = buildPdf(rows, scopeLabel, generatedAt)
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  }

  return new NextResponse(buildCsv(rows), {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
