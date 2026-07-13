'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import type { CostAccuracyRow } from '@/lib/analyticsCost'

// ── Data shapes (computed server-side in page.tsx) ───────────────

export interface DistrictCoverageRow {
  district: string
  count:    number
  isDesert: boolean
}

export interface AnalyticsData {
  overview: {
    activeTrainers:     number
    totalWorkshops:     number
    confirmedWorkshops: number
    invitesSent:        number
    acceptRatePct:      number | null
    districtsCovered:   number
    districtsTotal:     number
  }
  adoption: {
    confirmed:        number
    pending:          number
    declined:         number
    acceptRatePct:    number | null
    workshopsInvited: number
    workshopsStaffed: number
  }
  overlaps: {
    overlapCount:          number
    trainersWithConfirmed: number
  }
  cost: {
    // KPI tiles are derived from these rows client-side, so they track
    // the workshop filter and freshly saved actual costs live.
    rows: CostAccuracyRow[]
  }
  coverage: {
    districts:       DistrictCoverageRow[]
    desertCount:     number
    desertThreshold: number
  }
}

// Chart fills — darker steps of the brand hues, validated (dataviz
// six-checks) against the light surface. The UI badge tokens (#12B5AC,
// #F2A341) stay for text/badges; these are for filled marks only.
const FILL_CONFIRMED = '#0E9C94'
const FILL_PENDING   = '#B45309'
const FILL_DECLINED  = '#475569'
const FILL_PRIMARY   = '#1E63C4'

// ── Small building blocks ─────────────────────────────────────────

function StatTile({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: accent ?? '#0E2F57', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748B' }}>{sub}</p>}
    </div>
  )
}

function SectionCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <section style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 20 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0E2F57' }}>{title}</h2>
      {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>{subtitle}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  )
}

const fmtMyr = (v: number) => `RM ${v.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`

// ── Main component ────────────────────────────────────────────────

export function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const { t } = useLanguage()
  const a = t.analytics

  const { overview: o, adoption: ad, overlaps: ov, cost: c, coverage: cov } = data

  // Cost table: local editable copy with per-row save state
  const [costRows, setCostRows] = useState(c.rows)
  const [drafts, setDrafts]     = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // Workshop/programme filter over the cost table — 'all' or an engagement_id.
  const [costFilter, setCostFilter] = useState('all')
  const workshopOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of costRows) {
      if (!seen.has(r.engagement_id)) {
        seen.set(r.engagement_id, `${r.training_title ?? r.engagement_id.slice(0, 8)}${r.start_date ? ` · ${r.start_date}` : ''}`)
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }))
  }, [costRows])
  const filteredCostRows = useMemo(
    () => costFilter === 'all' ? costRows : costRows.filter(r => r.engagement_id === costFilter),
    [costRows, costFilter]
  )

  // KPI tiles derived from the FILTERED rows, so they answer "for this
  // workshop" when a programme is selected — and update live as actual
  // costs are saved.
  const costStats = useMemo(() => {
    const withActuals = filteredCostRows.filter(r => r.actual_myr != null && r.estimated_myr != null && r.estimated_myr > 0)
    const within20 = withActuals.filter(r =>
      Math.abs((r.actual_myr! - r.estimated_myr!) / r.estimated_myr!) <= 0.2
    ).length
    return {
      withActuals: withActuals.length,
      costAccuracyPct: withActuals.length > 0 ? Math.round((within20 / withActuals.length) * 100) : null,
      meanAbsErrPct: withActuals.length > 0
        ? Math.round(
            (withActuals.reduce((s, r) => s + Math.abs((r.actual_myr! - r.estimated_myr!) / r.estimated_myr!), 0) /
              withActuals.length) * 100
          )
        : null,
      totalEstimatedMyr: Math.round(filteredCostRows.reduce((s, r) => s + (r.estimated_myr ?? 0), 0)),
    }
  }, [filteredCostRows])

  const exportHref = (format: 'csv' | 'pdf') =>
    `/api/admin/analytics/cost-export?format=${format}${costFilter !== 'all' ? `&engagement_id=${encodeURIComponent(costFilter)}` : ''}`

  async function saveActual(row: CostAccuracyRow) {
    const key = `${row.engagement_id}:${row.trainer_id}`
    const raw = (drafts[key] ?? '').trim()
    const value = raw === '' ? null : Number(raw)
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      setRowError(e => ({ ...e, [key]: a.costInvalidNumber }))
      return
    }
    setSaving(key)
    setRowError(e => ({ ...e, [key]: '' }))
    try {
      const res = await fetch('/api/admin/travel-logs/actual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_id:   row.engagement_id,
          trainer_id:      row.trainer_id,
          actual_cost_myr: value,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Save failed')
      setCostRows(rows => rows.map(r =>
        r.engagement_id === row.engagement_id && r.trainer_id === row.trainer_id
          ? { ...r, actual_myr: value }
          : r
      ))
      setDrafts(d => { const nd = { ...d }; delete nd[key]; return nd })
    } catch (e) {
      setRowError(er => ({ ...er, [key]: (e as Error).message }))
    } finally {
      setSaving(null)
    }
  }

  const inviteTotal = ad.confirmed + ad.pending + ad.declined
  const maxDistrict = Math.max(1, ...cov.districts.map(d => d.count))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Overview tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatTile label={a.tileTrainers}   value={o.activeTrainers.toLocaleString()} />
        <StatTile label={a.tileWorkshops}  value={o.totalWorkshops.toLocaleString()} sub={`${o.confirmedWorkshops} ${a.tileConfirmedSuffix}`} />
        <StatTile label={a.tileInvites}    value={o.invitesSent.toLocaleString()} />
        <StatTile label={a.tileAcceptRate} value={o.acceptRatePct != null ? `${o.acceptRatePct}%` : '—'} accent={FILL_CONFIRMED} />
        <StatTile label={a.tileDistricts}  value={`${o.districtsCovered}/${o.districtsTotal}`} sub={`${cov.desertCount} ${a.tileDesertsSuffix}`} accent={cov.desertCount > 0 ? FILL_PENDING : FILL_CONFIRMED} />
      </div>

      {/* ── KPI: recommendation adoption ── */}
      <SectionCard title={a.adoptTitle} subtitle={a.adoptSubtitle}>
        {inviteTotal === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>{a.noData}</p>
        ) : (
          <>
            {/* Stacked outcome bar — 2px surface gaps between segments */}
            <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 2, background: '#F6F8FB' }}
                 role="img"
                 aria-label={`${a.adoptConfirmed}: ${ad.confirmed}, ${a.adoptPending}: ${ad.pending}, ${a.adoptDeclined}: ${ad.declined}`}>
              {ad.confirmed > 0 && <div style={{ width: `${(ad.confirmed / inviteTotal) * 100}%`, background: FILL_CONFIRMED, borderRadius: 4 }} />}
              {ad.pending   > 0 && <div style={{ width: `${(ad.pending   / inviteTotal) * 100}%`, background: FILL_PENDING,   borderRadius: 4 }} />}
              {ad.declined  > 0 && <div style={{ width: `${(ad.declined  / inviteTotal) * 100}%`, background: FILL_DECLINED,  borderRadius: 4 }} />}
            </div>
            {/* Legend with direct counts — identity never by color alone */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, fontSize: 12, color: '#475569' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: FILL_CONFIRMED, marginRight: 6, verticalAlign: 'middle' }} />{a.adoptConfirmed}: <strong>{ad.confirmed}</strong></span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: FILL_PENDING, marginRight: 6, verticalAlign: 'middle' }} />{a.adoptPending}: <strong>{ad.pending}</strong></span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: FILL_DECLINED, marginRight: 6, verticalAlign: 'middle' }} />{a.adoptDeclined}: <strong>{ad.declined}</strong></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
              <StatTile label={a.adoptAcceptRate} value={ad.acceptRatePct != null ? `${ad.acceptRatePct}%` : '—'} accent={FILL_CONFIRMED} />
              <StatTile label={a.adoptStaffed} value={`${ad.workshopsStaffed}/${ad.workshopsInvited}`} sub={a.adoptStaffedSub} />
            </div>
          </>
        )}
      </SectionCard>

      {/* ── KPI: overlapping bookings ── */}
      <SectionCard title={a.overlapTitle} subtitle={a.overlapSubtitle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <p style={{
            margin: 0, fontSize: 40, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
            color: ov.overlapCount === 0 ? FILL_CONFIRMED : '#B91C1C', lineHeight: 1,
          }}>
            {ov.overlapCount}
          </p>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0E2F57' }}>
              {ov.overlapCount === 0 ? a.overlapNone : a.overlapFound}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748B', maxWidth: 560 }}>
              {a.overlapNote.replace('{n}', String(ov.trainersWithConfirmed))}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── KPI: cost-estimate accuracy ── */}
      <SectionCard title={a.costTitle} subtitle={a.costSubtitle}>
        {/* Filter + budget-report downloads */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {a.costFilterLabel}
          </label>
          <select
            value={costFilter}
            onChange={e => setCostFilter(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', color: '#0E2F57', maxWidth: 360 }}
          >
            <option value="all">{a.costFilterAll}</option>
            {workshopOptions.map(w => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
          <span style={{ flex: 1 }} />
          {filteredCostRows.length > 0 && (
            <>
              <a
                href={exportHref('csv')}
                style={{ fontSize: 11, fontWeight: 700, color: 'white', background: FILL_PRIMARY, border: 'none', borderRadius: 999, padding: '6px 14px', textDecoration: 'none' }}
              >
                {a.costDownloadCsv}
              </a>
              <a
                href={exportHref('pdf')}
                style={{ fontSize: 11, fontWeight: 700, color: FILL_PRIMARY, background: 'white', border: `1px solid ${FILL_PRIMARY}`, borderRadius: 999, padding: '5px 14px', textDecoration: 'none' }}
              >
                {a.costDownloadPdf}
              </a>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatTile label={a.costAccuracy}       value={costStats.costAccuracyPct != null ? `${costStats.costAccuracyPct}%` : '—'} sub={a.costAccuracySub} accent={costStats.costAccuracyPct != null && costStats.costAccuracyPct >= 80 ? FILL_CONFIRMED : undefined} />
          <StatTile label={a.costMae}            value={costStats.meanAbsErrPct != null ? `${costStats.meanAbsErrPct}%` : '—'} />
          <StatTile label={a.costWithActuals}    value={`${costStats.withActuals}/${filteredCostRows.length}`} />
          <StatTile label={a.costTotalEstimated} value={fmtMyr(costStats.totalEstimatedMyr)} />
        </div>

        {filteredCostRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>{a.costNoRows}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#F6F8FB', borderBottom: '1px solid #E2E8F0' }}>
                  {[a.costThEngagement, a.costThTrainer, a.costThMode, a.costThEstimated, a.costThActual, a.costThVariance].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', textAlign: i >= 3 ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCostRows.map(r => {
                  const key = `${r.engagement_id}:${r.trainer_id}`
                  const variancePct = r.actual_myr != null && r.estimated_myr != null && r.estimated_myr > 0
                    ? Math.round(((r.actual_myr - r.estimated_myr) / r.estimated_myr) * 100)
                    : null
                  const within = variancePct != null && Math.abs(variancePct) <= 20
                  return (
                    <tr key={key} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 10px', color: '#0E2F57', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.training_title ?? '—'}
                        {r.start_date && <span style={{ display: 'block', fontWeight: 400, fontSize: 10, color: '#94A3B8' }}>{r.start_date}</span>}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{r.trainer_name ?? r.trainer_id}</td>
                      <td style={{ padding: '8px 10px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {r.transport_mode ?? '—'}
                        {r.cost_source && <span style={{ display: 'block', fontSize: 10, color: '#94A3B8' }}>{r.cost_source}</span>}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#334155', whiteSpace: 'nowrap' }}>
                        {r.estimated_myr != null ? fmtMyr(r.estimated_myr) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={drafts[key] ?? (r.actual_myr != null ? String(r.actual_myr) : '')}
                            onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                            placeholder={a.costEnterActual}
                            style={{ width: 96, fontSize: 12, padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}
                          />
                          {drafts[key] !== undefined && (
                            <button
                              onClick={() => saveActual(r)}
                              disabled={saving === key}
                              style={{ fontSize: 11, fontWeight: 700, color: 'white', background: FILL_PRIMARY, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: saving === key ? 'not-allowed' : 'pointer', opacity: saving === key ? 0.6 : 1 }}
                            >
                              {saving === key ? '…' : a.costSave}
                            </button>
                          )}
                        </span>
                        {rowError[key] && <span style={{ display: 'block', fontSize: 10, color: '#B91C1C', marginTop: 2 }}>{rowError[key]}</span>}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                        {variancePct != null ? (
                          <span style={{ color: within ? '#0F766E' : '#B91C1C', fontWeight: 700 }}>
                            {variancePct > 0 ? '+' : ''}{variancePct}%
                          </span>
                        ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94A3B8' }}>{a.costNote}</p>
      </SectionCard>

      {/* ── KPI: talent-desert coverage ── */}
      <SectionCard title={a.covTitle} subtitle={a.covSubtitle.replace('{n}', String(cov.desertThreshold))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {cov.districts.map(d => (
            <div key={d.district} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 90px', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {d.district}
              </span>
              <div style={{ height: 12, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(d.count > 0 ? 2 : 0, (d.count / maxDistrict) * 100)}%`,
                  background: d.isDesert ? FILL_PENDING : FILL_PRIMARY,
                  borderRadius: 4,
                }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: '#334155', whiteSpace: 'nowrap' }}>
                {d.count}
                {d.isDesert && (
                  <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 99, padding: '1px 6px', letterSpacing: '0.3px' }}>
                    {d.count === 0 ? a.covNoTrainers : a.covDesertBadge}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

    </div>
  )
}
