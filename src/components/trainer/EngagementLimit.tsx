'use client'

// Trainer engagement-limit UI (migration 030): a soft-warning badge and the
// trainer's workshop history for a year. Nothing here blocks an invitation.
import { useEffect, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { limitLevel, type EngagementCount, type LimitLevel } from '@/lib/engagementLimit'
import type { EngagementHistoryItem } from '@/app/api/trainers/engagements/route'

const LEVEL_STYLE: Record<LimitLevel, { bg: string; text: string; border: string }> = {
  ok:      { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' },
  near:    { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  reached: { bg: '#FEE2E2', text: '#B91C1C', border: '#F87171' },
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template)
}

function fmtRange(start: string | null, end: string | null, locale: 'en' | 'bm'): string {
  const loc = locale === 'bm' ? 'ms-MY' : 'en-MY'
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })
  if (!start) return '—'
  return !end || end === start ? f(start) : `${f(start)} – ${f(end)}`
}

// ── Badge ────────────────────────────────────────────────────────
export function EngagementBadge({
  count, onClick, expanded,
}: {
  count:     EngagementCount
  onClick?:  () => void
  expanded?: boolean
}) {
  const { t } = useLanguage()
  const tt = t.engagementLimit
  const level = limitLevel(count)
  const s = LEVEL_STYLE[level]
  const values = { n: count.confirmed, limit: count.limit, year: count.year }
  const label = level === 'reached' ? fill(tt.badgeReached, values)
    : level === 'near' ? fill(tt.badgeNear, values)
    : fill(tt.badge, values)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={onClick ? expanded : undefined}
      title={`${onClick ? tt.showHistory + ' — ' : ''}${tt.footnote}`}
      className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-bold"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, cursor: onClick ? 'pointer' : 'default' }}
    >
      {level !== 'ok' && <span aria-hidden>⚠</span>}
      {label}
      {count.pending > 0 && (
        <span className="font-medium opacity-80">· {fill(tt.pendingSuffix, { n: count.pending })}</span>
      )}
      {onClick && <span aria-hidden className="opacity-70">{expanded ? '▴' : '▾'}</span>}
    </button>
  )
}

// ── History list (fetches one trainer + year) ────────────────────
type HistoryState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ok'; confirmed: number; pending: number; limit: number; items: EngagementHistoryItem[] }

// The result is stored with the trainer+year it belongs to; anything else
// counts as still loading, so switching trainer/year never shows stale rows.
function useEngagementHistory(trainerId: string, year: number): HistoryState {
  const key = `${trainerId}:${year}`
  const [result, setResult] = useState<{ key: string; state: HistoryState } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/trainers/engagements?trainer_id=${encodeURIComponent(trainerId)}&year=${year}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => {
        if (!cancelled) setResult({ key, state: { kind: 'ok', confirmed: d.confirmed, pending: d.pending, limit: d.limit, items: d.items ?? [] } })
      })
      .catch(() => { if (!cancelled) setResult({ key, state: { kind: 'error' } }) })
    return () => { cancelled = true }
  }, [key, trainerId, year])
  return result?.key === key ? result.state : { kind: 'loading' }
}

function HistoryItems({ state }: { state: HistoryState }) {
  const { t, locale } = useLanguage()
  const tt = t.engagementLimit
  if (state.kind === 'loading') return <p className="text-[10px] text-muted">{tt.loading}</p>
  if (state.kind === 'error')   return <p className="text-[10px] text-muted">{tt.unavailable}</p>
  if (state.items.length === 0) return <p className="text-[10px] text-muted">{tt.none}</p>

  // Confirmed workshops are numbered in date order (1 = earliest), so each
  // row shows which use of the yearly limit it is. Pending ones don't count.
  const ordinal = new Map(
    state.items
      .filter(i => i.trainer_status === 'Confirmed')
      .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
      .map((i, idx) => [i.engagement_id, idx + 1]),
  )

  return (
    <ul className="space-y-1">
      {state.items.map(i => {
        const n     = ordinal.get(i.engagement_id)
        const level = n != null ? limitLevel({ confirmed: n, limit: state.limit }) : null
        const tag   = level ? LEVEL_STYLE[level] : null
        return (
          <li key={i.engagement_id} className="flex gap-1.5 text-[10px] leading-snug">
            <span
              className="mt-px h-fit shrink-0 rounded px-1 font-mono text-[9px] font-bold"
              style={tag
                ? { background: tag.bg, color: tag.text, border: `1px solid ${tag.border}` }
                : { background: '#FFFBEB', color: '#92400E', border: '1px dashed #F59E0B' }}
            >
              {n != null ? `${n}/${state.limit}` : '—'}
            </span>
            <span className="min-w-0">
              <span className="font-semibold text-ink-navy">{i.training_title || tt.untitled}</span>
              <span className="block text-muted">
                {fmtRange(i.start_date, i.end_date, locale)}
                {i.venue ? ` · ${i.venue}` : ''}
                {' · '}
                <span style={{ color: i.trainer_status === 'Confirmed' ? '#0F766E' : '#92400E', fontWeight: 600 }}>
                  {i.trainer_status === 'Confirmed' ? tt.statusConfirmed : tt.statusPending}
                </span>
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Inline history under a recommendation card (fixed year = the workshop's) */
export function EngagementHistoryInline({ trainerId, year }: { trainerId: string; year: number }) {
  const { t } = useLanguage()
  const state = useEngagementHistory(trainerId, year)
  return (
    <div className="mt-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
      <HistoryItems state={state} />
      <p className="mt-1.5 text-[9px] italic text-muted">{t.engagementLimit.footnote}</p>
    </div>
  )
}

/**
 * Full panel for the Talent screen's selected-trainer card, with year arrows.
 * Render with key={trainerId} so a newly selected trainer starts on this year.
 */
export function EngagementHistoryPanel({ trainerId }: { trainerId: string }) {
  const { t } = useLanguage()
  const tt = t.engagementLimit
  const [year, setYear] = useState(() => new Date().getFullYear())
  const state = useEngagementHistory(trainerId, year)

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate">{fill(tt.title, { year })}</span>
        <span className="flex items-center gap-0.5">
          <button type="button" onClick={() => setYear(y => y - 1)} aria-label={tt.prevYear} title={tt.prevYear}
            className="rounded px-1 text-xs text-muted hover:bg-surface hover:text-slate">‹</button>
          <button type="button" onClick={() => setYear(y => y + 1)} aria-label={tt.nextYear} title={tt.nextYear}
            className="rounded px-1 text-xs text-muted hover:bg-surface hover:text-slate">›</button>
        </span>
      </div>
      {state.kind === 'ok' && (
        <div className="mb-1.5">
          <EngagementBadge count={{ year, confirmed: state.confirmed, pending: state.pending, limit: state.limit }} />
          {limitLevel({ confirmed: state.confirmed, limit: state.limit }) === 'reached' && (
            <p className="mt-1 text-[10px]" style={{ color: '#B91C1C' }}>{tt.reachedNote}</p>
          )}
        </div>
      )}
      <div className="max-h-40 overflow-y-auto">
        <HistoryItems state={state} />
      </div>
      <p className="mt-1.5 text-[9px] italic text-muted">{tt.footnote}</p>
    </div>
  )
}
