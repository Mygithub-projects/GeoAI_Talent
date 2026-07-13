'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/i18n/LanguageProvider'
import type { CalendarEngagement } from '@/app/api/calendar/route'

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Confirmed':      { bg: '#CCFBF1', border: '#12B5AC', text: '#0F766E' },
  'Pending Invite': { bg: '#FEF3C7', border: '#F2A341', text: '#92400E' },
  'Draft':          { bg: '#F1F5F9', border: '#94A3B8', text: '#475569' },
}
const DEFAULT_COLOR = STATUS_COLORS['Draft']

const TRAINER_STATUS_PILL: Record<string, { symbol: string; color: string }> = {
  'Confirmed':      { symbol: '✓', color: '#0F766E' },
  'Declined':       { symbol: '✗', color: '#B91C1C' },
  'Pending Invite': { symbol: '⏳', color: '#92400E' },
}

function toDateOnly(s: string) {
  // Dates come as YYYY-MM-DD; construct at noon UTC to dodge TZ edges
  return new Date(`${s}T12:00:00Z`)
}

interface CalendarClientProps {
  userId:  string
  isAdmin: boolean
}

// Per-trainer outcome of a reschedule, from /api/engagements/update
interface RescheduleResultRow {
  trainer_id:      string
  trainer_name:    string
  email_delivered: boolean
}

export function CalendarClient({ userId, isAdmin }: CalendarClientProps) {
  const { t, locale } = useLanguage()
  const jsLocale = locale === 'bm' ? 'ms-MY' : 'en-MY'

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [engagements, setEngagements] = useState<CalendarEngagement[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [trainerQ, setTrainerQ]       = useState('')
  const [showDrafts, setShowDrafts]   = useState(false)
  const [selected, setSelected]       = useState<CalendarEngagement | null>(null)

  // Edit state inside the details modal
  const [editing, setEditing]       = useState(false)
  const [editTitle, setEditTitle]   = useState('')
  const [editVenue, setEditVenue]   = useState('')
  const [editStart, setEditStart]   = useState('')
  const [editEnd, setEditEnd]       = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rescheduleResult, setRescheduleResult] = useState<RescheduleResultRow[] | null>(null)

  const fetchMonth = useCallback(async (y: number, m: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/calendar?year=${y}&month=${m}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load calendar')
      const list: CalendarEngagement[] = data.engagements ?? []
      setEngagements(list)
      // Keep an open details modal in sync (trainer statuses, workflow
      // pill); if the workshop left this month's window, keep the old copy
      setSelected(prev => prev ? (list.find(x => x.engagement_id === prev.engagement_id) ?? prev) : prev)
    } catch (e) {
      // A failed background refresh keeps the last good grid on screen
      if (!opts?.silent) {
        setError((e as Error).message)
        setEngagements([])
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-month-change effect, not derived state
    fetchMonth(year, month)
  }, [year, month, fetchMonth])

  // Silent refresh every 60s and on window focus (same pattern as the
  // NotificationBell) — trainer accepts/declines happen out-of-band via
  // email links, so an open calendar goes stale without this.
  useEffect(() => {
    const tick = () => { void fetchMonth(year, month, { silent: true }) }
    const interval = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', tick)
    }
  }, [year, month, fetchMonth])

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }
  function goToday() {
    const d = new Date()
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  function openDetails(e: CalendarEngagement) {
    setSelected(e)
    setEditing(false)
    setActionError(null)
    setEditTitle(e.training_title ?? '')
    setEditVenue(e.venue_name === 'TBC' ? '' : e.venue_name)
    setEditStart(e.start_date)
    setEditEnd(e.end_date)
  }
  function closeDetails() {
    setSelected(null)
    setEditing(false)
    setActionError(null)
    setRescheduleResult(null)
  }

  // Returns the parsed response body on success, null on failure
  async function postAction(url: string, body: object): Promise<Record<string, unknown> | null> {
    setActionBusy(true)
    setActionError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Action failed')
      return data as Record<string, unknown>
    } catch (e) {
      setActionError((e as Error).message)
      return null
    } finally {
      setActionBusy(false)
    }
  }

  async function handleSaveEdit() {
    if (!selected) return
    const isDraft = selected.workflow_status === 'Draft'
    const datesChanged = editStart !== selected.start_date || editEnd !== selected.end_date
    const body: Record<string, unknown> = {
      engagement_id:      selected.engagement_id,
      training_title:     editTitle,
      dynamic_venue_name: editVenue,
      start_date:         editStart,
      end_date:           editEnd,
    }
    if (!isDraft && datesChanged) {
      // Rescheduling resets accepted trainers and re-sends invitations
      if (!window.confirm(t.calendar.rescheduleConfirm)) return
      body.confirm_reschedule = true
    }
    const data = await postAction('/api/engagements/update', body)
    if (!data) return
    const reschedule = data.reschedule as { affected: RescheduleResultRow[] } | undefined
    if (reschedule) {
      // Keep the modal open to show per-trainer send results;
      // refresh the grid behind it so the new dates appear at once
      setRescheduleResult(reschedule.affected)
      setEditing(false)
      fetchMonth(year, month)
    } else {
      closeDetails()
      fetchMonth(year, month)
    }
  }

  async function handleCancelWorkshop() {
    if (!selected) return
    if (!window.confirm(t.calendar.cancelConfirm)) return
    if (await postAction('/api/engagements/cancel', { engagement_id: selected.engagement_id })) {
      closeDetails()
      fetchMonth(year, month)
    }
  }

  async function handleDeleteDraft() {
    if (!selected) return
    if (!window.confirm(t.calendar.deleteConfirm)) return
    if (await postAction('/api/engagements/delete', { engagement_id: selected.engagement_id })) {
      closeDetails()
      fetchMonth(year, month)
    }
  }

  // Filters: drafts hidden unless toggled; trainer name matches any invitee
  const filtered = useMemo(() => {
    const q = trainerQ.trim().toLowerCase()
    return engagements.filter(e => {
      if (!showDrafts && e.workflow_status === 'Draft') return false
      if (q && !e.trainers.some(tr => tr.trainer_name.toLowerCase().includes(q))) return false
      return true
    })
  }, [engagements, trainerQ, showDrafts])

  const trainerNames = useMemo(
    () => [...new Set(engagements.flatMap(e => e.trainers.map(tr => tr.trainer_name)))].sort(),
    [engagements],
  )

  // ── Month grid maths (Monday-first) ────────────────────────────
  const firstOfMonth  = new Date(year, month - 1, 1)
  const daysInMonth   = new Date(year, month, 0).getDate()
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7
  const totalCells    = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7

  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEngagement[]>()
    for (const e of filtered) {
      const start = toDateOnly(e.start_date)
      const end   = toDateOnly(e.end_date)
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) continue
        const key = `${year}-${pad(month)}-${pad(d.getUTCDate())}`
        const list = map.get(key) ?? []
        list.push(e)
        map.set(key, list)
      }
    }
    return map
  }, [filtered, year, month])

  const monthLabel = firstOfMonth.toLocaleDateString(jsLocale, { month: 'long', year: 'numeric' })
  // 2026-01-05 was a Monday — derive localized short weekday names from it
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 5 + i).toLocaleDateString(jsLocale, { weekday: 'short' }))

  const fmtRange = (e: CalendarEngagement) =>
    `${toDateOnly(e.start_date).toLocaleDateString(jsLocale, { day: 'numeric', month: 'short' })} – ${toDateOnly(e.end_date).toLocaleDateString(jsLocale, { day: 'numeric', month: 'short', year: 'numeric' })}`

  const canManage = selected ? (isAdmin || selected.created_by === userId) : false
  const selectedIsDraft = selected?.workflow_status === 'Draft'

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8 }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1180, margin: '0 auto', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0E2F57', margin: '0 0 2px' }}>{t.calendar.title}</h1>
      <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 16px' }}>{isAdmin ? t.calendar.subtitle : t.calendar.subtitleUser}</p>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => shiftMonth(-1)} aria-label={t.calendar.prevMonth}
            style={{ fontSize: 14, padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: 'pointer' }}>◀</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0E2F57', minWidth: 170, textAlign: 'center', textTransform: 'capitalize' }}>
            {monthLabel}
          </span>
          <button onClick={() => shiftMonth(1)} aria-label={t.calendar.nextMonth}
            style={{ fontSize: 14, padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: 'pointer' }}>▶</button>
        </div>
        <button onClick={goToday}
          style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', color: '#1E63C4', cursor: 'pointer' }}>
          {t.calendar.today}
        </button>

        <input
          type="text"
          list="calendar-trainers"
          value={trainerQ}
          onChange={e => setTrainerQ(e.target.value)}
          placeholder={t.calendar.trainerFilterPlaceholder}
          style={{ fontSize: 13, padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, width: 240, background: 'white' }}
        />
        <datalist id="calendar-trainers">
          {trainerNames.map(n => <option key={n} value={n} />)}
        </datalist>
        {trainerQ && (
          <button onClick={() => setTrainerQ('')}
            style={{ fontSize: 12, color: '#64748B', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            × {t.calendar.clearFilter}
          </button>
        )}

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showDrafts} onChange={e => setShowDrafts(e.target.checked)} />
          {t.calendar.showDrafts}
        </label>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: '#64748B' }}>
          {(['Confirmed', 'Pending Invite', ...(showDrafts ? ['Draft'] as const : [])] as string[]).map(s => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: (STATUS_COLORS[s] ?? DEFAULT_COLOR).border, display: 'inline-block' }} />
              {s}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#B91C1C', background: '#FEE2E2', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{error}</p>
      )}

      {/* Month grid */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#F6F8FB', borderBottom: '1px solid #E2E8F0' }}>
          {weekdays.map(d => (
            <div key={d} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {Array.from({ length: totalCells }, (_, i) => {
            const dayNum = i - leadingBlanks + 1
            const inMonth = dayNum >= 1 && dayNum <= daysInMonth
            const dateKey = inMonth ? `${year}-${pad(month)}-${pad(dayNum)}` : ''
            const items = inMonth ? (byDay.get(dateKey) ?? []) : []
            const isToday = dateKey === todayStr
            return (
              <div key={i} style={{
                minHeight: 96, padding: 6, borderTop: '1px solid #F1F5F9',
                borderLeft: i % 7 === 0 ? 'none' : '1px solid #F1F5F9',
                background: inMonth ? 'white' : '#FAFBFC',
              }}>
                {inMonth && (
                  <>
                    <div style={{
                      fontSize: 11, fontWeight: isToday ? 800 : 600, marginBottom: 4,
                      color: isToday ? 'white' : '#64748B',
                      background: isToday ? '#1E63C4' : 'transparent',
                      borderRadius: 99, width: 20, height: 20, lineHeight: '20px', textAlign: 'center',
                    }}>
                      {dayNum}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 96, overflowY: 'auto' }}>
                      {items.map(e => {
                        const c = STATUS_COLORS[e.workflow_status] ?? DEFAULT_COLOR
                        return (
                          <button
                            key={e.engagement_id}
                            onClick={() => openDetails(e)}
                            title={`${e.training_title ?? t.calendar.untitled} · ${e.venue_name}`}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              fontSize: 10, fontWeight: 600, color: c.text,
                              background: c.bg, borderLeft: `3px solid ${c.border}`,
                              border: 'none', borderRadius: 4, padding: '3px 6px',
                              cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                          >
                            {e.training_title ?? t.calendar.untitled}
                            {e.workflow_status !== 'Draft' && ` · ${e.confirmed_count}/${e.trainers_needed}`}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {loading && <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>{t.common.loading}</p>}
      {!loading && filtered.length === 0 && !error && (
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>{t.calendar.noEngagements}</p>
      )}

      {/* Details / edit modal */}
      {selected && (
        <div
          onClick={closeDetails}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15,23,42,0.55)', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
          >
            <div style={{ background: '#0E2F57', color: 'white', padding: '14px 20px', borderRadius: '14px 14px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                {editing ? t.calendar.editWorkshop : (selected.training_title ?? t.calendar.untitled)}
              </h2>
            </div>
            <div style={{ padding: 20, fontSize: 13, color: '#15233A' }}>
              {rescheduleResult ? (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#0E2F57' }}>
                    {t.calendar.rescheduleResultTitle}
                  </p>
                  {rescheduleResult.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>{t.calendar.rescheduleNoTrainers}</p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {rescheduleResult.map(r => (
                        <li key={r.trainer_id} style={{ fontSize: 12, padding: '4px 0', color: r.email_delivered ? '#0F766E' : '#92400E' }}>
                          {r.email_delivered
                            ? <>✓ {r.trainer_name} — {t.calendar.rescheduleEmailOk}</>
                            : <>⚠ {r.trainer_name} — {t.calendar.rescheduleEmailFailed}</>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <button onClick={closeDetails}
                      style={{ fontSize: 12, fontWeight: 700, color: 'white', background: '#0E2F57', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
                      {t.calendar.close}
                    </button>
                  </div>
                </>
              ) : editing ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>{t.calendar.titleFieldLabel}</label>
                    <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>{t.calendar.venueLabel}</label>
                    <input type="text" value={editVenue} onChange={e => setEditVenue(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{t.calendar.startLabel}</label>
                      <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{t.calendar.endLabel}</label>
                      <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  {!selectedIsDraft && (
                    <p style={{ fontSize: 10, color: '#92400E', margin: '0 0 10px' }}>{t.calendar.rescheduleNote}</p>
                  )}

                  {actionError && <p style={{ fontSize: 11, color: '#B91C1C', marginBottom: 10 }}>{actionError}</p>}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <button onClick={() => { setEditing(false); setActionError(null) }}
                      style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
                      {t.common.cancel}
                    </button>
                    <button onClick={handleSaveEdit} disabled={actionBusy}
                      style={{ fontSize: 12, fontWeight: 700, color: 'white', background: '#12B5AC', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                      {actionBusy ? t.calendar.saving : t.common.save}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 6px' }}>
                    <span style={{ color: '#64748B' }}>{t.calendar.venueLabel}: </span>{selected.venue_name}
                  </p>
                  <p style={{ margin: '0 0 6px' }}>
                    <span style={{ color: '#64748B' }}>{t.calendar.datesLabel}: </span>{fmtRange(selected)}
                  </p>
                  <p style={{ margin: '0 0 12px' }}>
                    <span style={{ color: '#64748B' }}>{t.calendar.statusLabel}: </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: (STATUS_COLORS[selected.workflow_status] ?? DEFAULT_COLOR).bg,
                      color: (STATUS_COLORS[selected.workflow_status] ?? DEFAULT_COLOR).text,
                    }}>
                      {selected.workflow_status}
                    </span>
                    {' '}· {selected.confirmed_count}/{selected.trainers_needed} {t.calendar.confirmedWord}
                  </p>

                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {t.calendar.trainersLabel}
                  </p>
                  {selected.trainers.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>{t.calendar.noTrainersYet}</p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {selected.trainers.map(tr => {
                        const pill = TRAINER_STATUS_PILL[tr.status] ?? { symbol: '·', color: '#64748B' }
                        return (
                          <li key={tr.trainer_id} style={{ fontSize: 12, padding: '3px 0', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                            <span style={{ color: pill.color, fontWeight: 700 }}>{pill.symbol}</span>
                            <span>{tr.trainer_name}</span>
                            <span style={{ color: '#94A3B8', fontSize: 11 }}>({tr.status})</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {actionError && <p style={{ fontSize: 11, color: '#B91C1C', margin: '10px 0 0' }}>{actionError}</p>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                    {canManage && (
                      <>
                        <button onClick={() => setEditing(true)}
                          style={{ fontSize: 12, fontWeight: 600, color: '#1E63C4', background: 'transparent', border: '1px solid #BFDBFE', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                          {t.calendar.editWorkshop}
                        </button>
                        {selectedIsDraft ? (
                          <button onClick={handleDeleteDraft} disabled={actionBusy}
                            style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', background: 'transparent', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: actionBusy ? 'not-allowed' : 'pointer' }}>
                            {t.calendar.deleteDraft}
                          </button>
                        ) : (
                          <button onClick={handleCancelWorkshop} disabled={actionBusy}
                            style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', background: 'transparent', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: actionBusy ? 'not-allowed' : 'pointer' }}>
                            {t.calendar.cancelWorkshop}
                          </button>
                        )}
                      </>
                    )}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                      <Link href="/engagements"
                        style={{ fontSize: 12, fontWeight: 600, color: '#1E63C4', padding: '8px 4px', textDecoration: 'none' }}>
                        {t.calendar.openBacklog} →
                      </Link>
                      <button onClick={closeDetails}
                        style={{ fontSize: 12, fontWeight: 700, color: 'white', background: '#0E2F57', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
                        {t.calendar.close}
                      </button>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
