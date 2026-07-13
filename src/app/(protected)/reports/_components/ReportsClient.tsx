'use client'

import { Fragment, useMemo, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import type { Translations } from '@/i18n/en'
import type { ReportWorkshop, ReportTrainerRow } from '@/lib/reportData'

// ── Helpers ──────────────────────────────────────────────────────

const fmtMyr  = (v: number) => `RM ${v.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function statusLabel(status: string, t: Translations): string {
  switch (status) {
    case 'Draft':          return t.reports.stDraft
    case 'Pending Invite': return t.reports.stPendingInvite
    case 'Confirmed':      return t.reports.stConfirmed
    case 'Declined':       return t.reports.stDeclined
    case 'Cancelled':      return t.reports.stCancelled
    default:               return status
  }
}

function clsLabel(cls: string, t: Translations): string {
  switch (cls) {
    case 'suitable':       return t.reports.clsSuitable
    case 'pending_review': return t.reports.clsPendingReview
    case 'not_matched':    return t.reports.clsNotMatched
    case 'confirmed':      return t.reports.clsConfirmed
    case 'declined':       return t.reports.clsDeclined
    default:               return cls
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Draft':          { bg: '#F1F5F9', text: '#475569' },
  'Pending Invite': { bg: '#FEF3C7', text: '#92400E' },
  'Confirmed':      { bg: '#CCFBF1', text: '#0F766E' },
  'Declined':       { bg: '#E2E8F0', text: '#475569' },
  'Cancelled':      { bg: '#FEE2E2', text: '#B91C1C' },
}

const CLS_COLORS: Record<string, { bg: string; text: string }> = {
  suitable:       { bg: '#CCFBF1', text: '#0F766E' },
  pending_review: { bg: '#FEF3C7', text: '#92400E' },
  not_matched:    { bg: '#E2E8F0', text: '#475569' },
  confirmed:      { bg: '#CCFBF1', text: '#0F766E' },
  declined:       { bg: '#FEE2E2', text: '#B91C1C' },
}

function Pill({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return (
    <span style={{ background: colors.bg, color: colors.text, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────

interface Props {
  workshops:               ReportWorkshop[]
  isAdmin:                 boolean
  userId:                  string
  classificationAvailable: boolean
}

export function ReportsClient({ workshops: initialWorkshops, isAdmin, userId, classificationAvailable }: Props) {
  const { t, locale } = useLanguage()
  const r = t.reports

  const [workshops, setWorkshops] = useState(initialWorkshops)
  const [q, setQ]                 = useState('')
  const [workshopId, setWorkshopId] = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [district, setDistrict]   = useState('')
  const [status, setStatus]       = useState('')
  const [response, setResponse]   = useState('')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [busy, setBusy]           = useState<string | null>(null)   // engagement_id or `${eid}:${tid}`
  const [rowError, setRowError]   = useState<Record<string, string>>({})

  const districts = useMemo(
    () => [...new Set(workshops.map(w => w.creator_district).filter(Boolean) as string[])].sort(),
    [workshops]
  )

  // Dropdown alternative to typing: pick one of the workshops the user
  // keyed into the system (already role-scoped — the prop only ever
  // contains their own workshops for non-admins). Newest first, matching
  // the table's created_at ordering.
  const workshopOptions = useMemo(
    () => workshops.map(w => ({
      id:    w.engagement_id,
      label: `${w.training_title ?? r.untitled}${w.venue_name ? ` — ${w.venue_name}` : ''}${w.start_date ? ` (${fmtDate(w.start_date)})` : ''}`,
    })),
    [workshops, r.untitled]
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return workshops.filter(w => {
      if (workshopId && w.engagement_id !== workshopId) return false
      if (status && w.workflow_status !== status) return false
      if (district && w.creator_district !== district) return false
      if (response && !w.trainers.some(tr => tr.status === response)) return false
      if (dateFrom && (!w.start_date || w.start_date < dateFrom)) return false
      if (dateTo && (!w.start_date || w.start_date > dateTo)) return false
      if (needle) {
        const hay = [w.training_title, w.venue_name, w.creator_name, w.creator_district,
                     ...w.trainers.map(tr => tr.trainer_name)].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [workshops, q, workshopId, status, district, response, dateFrom, dateTo])

  const totals = useMemo(() => ({
    invited:   filtered.reduce((s, w) => s + w.invitedCount, 0),
    accepted:  filtered.reduce((s, w) => s + w.confirmedCount, 0),
    pending:   filtered.reduce((s, w) => s + w.pendingCount, 0),
    declined:  filtered.reduce((s, w) => s + w.declinedCount, 0),
    estCost:   filtered.reduce((s, w) => s + w.estCostConfirmedMyr, 0),
  }), [filtered])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function mergeTrainerRows(engagementId: string, rows: Partial<ReportTrainerRow>[]) {
    setWorkshops(ws => ws.map(w => {
      if (w.engagement_id !== engagementId) return w
      return {
        ...w,
        trainers: w.trainers.map(tr => {
          const upd = rows.find(u => u.trainer_id === tr.trainer_id)
          return upd ? { ...tr, ...upd } : tr
        }),
      }
    }))
  }

  async function generateSuggestions(w: ReportWorkshop) {
    setBusy(w.engagement_id)
    setRowError(e => ({ ...e, [w.engagement_id]: '' }))
    try {
      const res = await fetch('/api/reports/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagement_id: w.engagement_id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed')
      mergeTrainerRows(w.engagement_id, body.rows ?? [])
    } catch (e) {
      setRowError(er => ({ ...er, [w.engagement_id]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  async function setClassification(w: ReportWorkshop, tr: ReportTrainerRow, classification: string) {
    const key = `${w.engagement_id}:${tr.trainer_id}`
    setBusy(key)
    setRowError(e => ({ ...e, [key]: '' }))
    try {
      const res = await fetch('/api/reports/classification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagement_id: w.engagement_id, trainer_id: tr.trainer_id, classification }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed')
      mergeTrainerRows(w.engagement_id, [{ trainer_id: tr.trainer_id, fit_classification: classification, fit_decided_at: new Date().toISOString() }])
    } catch (e) {
      setRowError(er => ({ ...er, [key]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (q.trim())   params.set('q', q.trim())
    if (workshopId) params.set('workshop', workshopId)
    if (dateFrom)  params.set('date_from', dateFrom)
    if (dateTo)    params.set('date_to', dateTo)
    if (district)  params.set('district', district)
    if (status)    params.set('status', status)
    if (response)  params.set('response', response)
    window.location.href = `/api/reports/export?${params.toString()}`
  }

  const inputStyle = { fontSize: 13, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white' } as const
  const STATUSES  = ['Draft', 'Pending Invite', 'Confirmed', 'Declined', 'Cancelled']
  const RESPONSES = ['Pending Invite', 'Confirmed', 'Declined']

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-slate">{r.title}</h1>
        <p className="mt-1 text-sm text-muted">{isAdmin ? r.subtitleAdmin : r.subtitleUser}</p>
      </div>

      {!classificationAvailable && (
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 12px' }}>
          {r.migrationBanner}
        </p>
      )}

      {/* Summary chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '20px 0 16px' }}>
        {[
          [r.chipWorkshops, String(filtered.length), '#0E2F57'],
          [r.chipInvited,   String(totals.invited),  '#1E63C4'],
          [r.chipAccepted,  String(totals.accepted), '#0F766E'],
          [r.chipPending,   String(totals.pending),  '#92400E'],
          [r.chipDeclined,  String(totals.declined), '#B91C1C'],
          [r.chipEstCost,   fmtMyr(totals.estCost),  '#0E2F57'],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={r.searchPlaceholder} style={{ ...inputStyle, width: 220 }} />
        <select value={workshopId} onChange={e => setWorkshopId(e.target.value)} style={{ ...inputStyle, maxWidth: 260 }} aria-label={r.allWorkshops}>
          <option value="">{r.allWorkshops}</option>
          {workshopOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} aria-label={r.fromDate} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} aria-label={r.toDate} />
        {isAdmin && (
          <select value={district} onChange={e => setDistrict(e.target.value)} style={inputStyle}>
            <option value="">{r.allDistricts}</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="">{r.allStatuses}</option>
          {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s, t)}</option>)}
        </select>
        <select value={response} onChange={e => setResponse(e.target.value)} style={inputStyle}>
          <option value="">{r.allResponses}</option>
          {RESPONSES.map(s => <option key={s} value={s}>{statusLabel(s, t)}</option>)}
        </select>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'white', background: '#1E63C4', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: filtered.length === 0 ? 0.5 : 1 }}
        >
          ⬇ {r.exportCsv}
        </button>
      </div>

      {/* Report table */}
      <div style={{ overflowX: 'auto', background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
          <thead>
            <tr style={{ background: '#F6F8FB', borderBottom: '1px solid #E2E8F0' }}>
              {['', r.thWorkshop, r.thDates, r.thDistrict, r.thStatus, r.thInvited, r.thAccepted, r.thPending, r.thDeclined, r.thEstCost].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: i >= 5 ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>{r.noWorkshops}</td></tr>
            ) : filtered.map((w, i) => {
              const isOpen = expanded.has(w.engagement_id)
              const canManage = isAdmin || w.created_by === userId
              const skill = locale === 'bm' ? w.target_skill_bm : w.target_skill_en
              const hasPendingRows = w.trainers.some(tr => tr.status === 'Pending Invite')
              return (
                <Fragment key={w.engagement_id}>
                  <tr
                    onClick={() => toggle(w.engagement_id)}
                    style={{ borderTop: '1px solid #F1F5F9', cursor: 'pointer', background: isOpen ? '#F8FAFC' : i % 2 ? '#FAFCFE' : 'white' }}
                  >
                    <td style={{ padding: '10px 8px', width: 20 }}>
                      <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: '#94A3B8' }}>▸</span>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 240 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: '#0E2F57', lineHeight: 1.3 }}>
                        {w.training_title ?? <em style={{ fontWeight: 400, color: '#94A3B8' }}>{r.untitled}</em>}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>
                        📍 {w.venue_name ?? 'TBC'}{skill ? ` · ${skill}` : ''}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8' }}>{w.creator_name ?? '—'}</p>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                      {fmtDate(w.start_date)}
                      {w.end_date && w.end_date !== w.start_date && <><br /><span style={{ color: '#94A3B8' }}>→ {fmtDate(w.end_date)}</span></>}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#64748B', fontSize: 11 }}>{w.creator_district ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Pill label={statusLabel(w.workflow_status, t)} colors={STATUS_COLORS[w.workflow_status] ?? STATUS_COLORS.Draft} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{w.invitedCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#0F766E', fontWeight: 700 }}>{w.confirmedCount}/{w.trainers_needed}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#92400E' }}>{w.pendingCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#B91C1C' }}>{w.declinedCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                      {fmtMyr(w.estCostConfirmedMyr)}
                      {w.estCostInvitedMyr !== w.estCostConfirmedMyr && (
                        <span style={{ display: 'block', fontSize: 10, color: '#94A3B8' }}>{r.costInvitedPrefix} {fmtMyr(w.estCostInvitedMyr)}</span>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr style={{ background: '#F8FAFC' }}>
                      <td colSpan={10} style={{ padding: '4px 14px 16px 42px' }}>
                        {canManage && classificationAvailable && hasPendingRows && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
                            <button
                              onClick={e => { e.stopPropagation(); generateSuggestions(w) }}
                              disabled={busy === w.engagement_id}
                              style={{ fontSize: 11, fontWeight: 700, color: '#5B21B6', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 8, padding: '6px 12px', cursor: busy === w.engagement_id ? 'not-allowed' : 'pointer', opacity: busy === w.engagement_id ? 0.6 : 1 }}
                            >
                              {busy === w.engagement_id ? r.aiSuggesting : `✦ ${r.aiSuggestBtn}`}
                            </button>
                            <span style={{ fontSize: 10, color: '#94A3B8' }}>{r.aiDisclaimer}</span>
                          </div>
                        )}
                        {rowError[w.engagement_id] && (
                          <p style={{ margin: '4px 0', fontSize: 11, color: '#B91C1C' }}>{rowError[w.engagement_id]}</p>
                        )}
                        {w.trainers.length === 0 ? (
                          <p style={{ margin: '8px 0', fontSize: 12, color: '#94A3B8' }}>{r.noTrainers}</p>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                {[r.thTrainer, r.thTrainerDistrict, r.thResponse, r.thResponded, r.thDistance, r.thEstCostT, r.thActualCost, ...(classificationAvailable ? [r.thClassification] : [])].map((h, hi) => (
                                  <th key={hi} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {w.trainers.map(tr => {
                                const key = `${w.engagement_id}:${tr.trainer_id}`
                                const responded = tr.status !== 'Pending Invite'
                                const reason = locale === 'bm' ? tr.fit_reason_bm : tr.fit_reason_en
                                return (
                                  <tr key={tr.trainer_id} style={{ borderTop: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '7px 10px', color: '#0E2F57', fontWeight: 600, whiteSpace: 'nowrap' }}>{tr.trainer_name ?? tr.trainer_id}</td>
                                    <td style={{ padding: '7px 10px', color: '#64748B', whiteSpace: 'nowrap' }}>{tr.trainer_district ?? '—'}</td>
                                    <td style={{ padding: '7px 10px' }}>
                                      <Pill label={statusLabel(tr.status, t)} colors={STATUS_COLORS[tr.status] ?? STATUS_COLORS.Draft} />
                                    </td>
                                    <td style={{ padding: '7px 10px', color: '#64748B', whiteSpace: 'nowrap' }}>{tr.responded_at ? fmtDate(tr.responded_at.slice(0, 10)) : '—'}</td>
                                    <td style={{ padding: '7px 10px', color: '#334155', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                                      {tr.distance_km != null ? `${tr.distance_km} km` : '—'}{tr.transport_mode ? ` · ${tr.transport_mode}` : ''}
                                    </td>
                                    <td style={{ padding: '7px 10px', color: '#334155', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                                      {tr.est_cost_myr != null ? fmtMyr(tr.est_cost_myr) : '—'}
                                    </td>
                                    <td style={{ padding: '7px 10px', color: '#334155', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                                      {tr.actual_cost_myr != null ? fmtMyr(tr.actual_cost_myr) : '—'}
                                    </td>
                                    {classificationAvailable && (
                                      <td style={{ padding: '7px 10px', minWidth: 220 }}>
                                        {tr.fit_classification ? (
                                          <span>
                                            <Pill label={clsLabel(tr.fit_classification, t)} colors={CLS_COLORS[tr.fit_classification] ?? CLS_COLORS.pending_review} />
                                            {tr.fit_decided_at && <span style={{ marginLeft: 6, fontSize: 9, color: '#94A3B8' }}>{r.decidedLabel}</span>}
                                          </span>
                                        ) : tr.fit_suggestion && !responded ? (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: '#5B21B6' }}>✦ {r.aiSuggestionPrefix}:</span>
                                            <Pill label={clsLabel(tr.fit_suggestion, t)} colors={CLS_COLORS[tr.fit_suggestion] ?? CLS_COLORS.pending_review} />
                                            {canManage && (
                                              <button
                                                onClick={() => setClassification(w, tr, tr.fit_suggestion!)}
                                                disabled={busy === key}
                                                style={{ fontSize: 10, fontWeight: 700, color: '#0F766E', background: 'transparent', border: '1px solid #99F6E4', borderRadius: 6, padding: '2px 8px', cursor: busy === key ? 'not-allowed' : 'pointer' }}
                                              >
                                                {busy === key ? '…' : `✓ ${r.approveBtn}`}
                                              </button>
                                            )}
                                            {reason && <span style={{ display: 'block', width: '100%', fontSize: 10, color: '#64748B' }}>{reason}</span>}
                                          </span>
                                        ) : (
                                          <span style={{ color: '#CBD5E1' }}>—</span>
                                        )}
                                        {canManage && !responded && (
                                          <select
                                            value=""
                                            onChange={e => { if (e.target.value) setClassification(w, tr, e.target.value) }}
                                            disabled={busy === key}
                                            style={{ display: 'block', marginTop: 4, fontSize: 10, padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 6, background: 'white', color: '#64748B' }}
                                          >
                                            <option value="">{r.overrideLabel}</option>
                                            {['suitable', 'pending_review', 'not_matched'].map(c => (
                                              <option key={c} value={c}>{clsLabel(c, t)}</option>
                                            ))}
                                          </select>
                                        )}
                                        {rowError[key] && <span style={{ display: 'block', fontSize: 10, color: '#B91C1C', marginTop: 2 }}>{rowError[key]}</span>}
                                      </td>
                                    )}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94A3B8' }}>{r.footnote}</p>
    </div>
  )
}
