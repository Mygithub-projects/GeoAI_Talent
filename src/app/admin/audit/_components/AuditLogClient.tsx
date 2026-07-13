'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'

export interface AuditViewerRow {
  log_id:       string
  actor_name:   string | null    // null = system action (e.g. a trainer's email click)
  action:       string
  entity_type:  string | null
  entity_id:    string | null
  payload_json: Record<string, unknown> | null
  created_at:   string
}

const PAGE_SIZE = 25

// Chip colours per action family — same palette as the /engagements tab.
const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  'engagement.invite':     { bg: '#EDE9FE', text: '#5B21B6' },
  'engagement.reinvite':   { bg: '#FEF3C7', text: '#92400E' },
  'engagement.confirm':    { bg: '#CCFBF1', text: '#0F766E' },
  'engagement.cancel':     { bg: '#FEE2E2', text: '#B91C1C' },
  'engagement.accept':     { bg: '#CCFBF1', text: '#0F766E' },
  'engagement.decline':    { bg: '#FEE2E2', text: '#B91C1C' },
  'engagement.update':     { bg: '#E0E7FF', text: '#3730A3' },
  'engagement.reschedule': { bg: '#FEF3C7', text: '#92400E' },
  'engagement.delete':     { bg: '#FEE2E2', text: '#B91C1C' },
  'admin.table_create':    { bg: '#DBEAFE', text: '#1E40AF' },
  'admin.table_update':    { bg: '#E0E7FF', text: '#3730A3' },
  'admin.table_delete':    { bg: '#FEE2E2', text: '#B91C1C' },
  'admin.table_restore':   { bg: '#CCFBF1', text: '#0F766E' },
  'admin.cost_actual':     { bg: '#DBEAFE', text: '#1E40AF' },
  'user.approve':          { bg: '#DBEAFE', text: '#1E40AF' },
  'user.create':           { bg: '#DBEAFE', text: '#1E40AF' },
  'user.role_change':      { bg: '#E0E7FF', text: '#3730A3' },
  'user.suspend':          { bg: '#FEF3C7', text: '#92400E' },
  'user.reactivate':       { bg: '#CCFBF1', text: '#0F766E' },
  'user.delete':           { bg: '#FEE2E2', text: '#B91C1C' },
  'profile.role_change':   { bg: '#E0E7FF', text: '#3730A3' },
}

function ActionChip({ action }: { action: string }) {
  const s = ACTION_STYLES[action] ?? { bg: '#F1F5F9', text: '#475569' }
  return (
    <span style={{
      background: s.bg, color: s.text,
      fontSize: 10, fontWeight: 700,
      padding: '2px 7px', borderRadius: 99, letterSpacing: '0.2px', whiteSpace: 'nowrap',
    }}>
      {action}
    </span>
  )
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Compact human summary of the payload; the full JSON is behind the
// expand toggle so nothing recorded is ever unreachable from the UI.
function summarizePayload(p: Record<string, unknown> | null): string {
  if (!p) return ''
  const parts: string[] = []
  const push = (k: string, v: unknown) => {
    if (typeof v === 'string' && v) parts.push(`${k}: ${v.length > 48 ? v.slice(0, 48) + '…' : v}`)
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}: ${v}`)
  }
  for (const key of ['trainer_name', 'full_name', 'email', 'email_sent_to', 'role', 'district',
                     'previous_status', 'reason', 'note', 'method', 'mode', 'actual_cost_myr']) {
    push(key, p[key])
  }
  if (parts.length === 0) {
    Object.entries(p)
      .filter(([k]) => k !== 'actor_name')
      .slice(0, 3)
      .forEach(([k, v]) => push(k, typeof v === 'object' ? JSON.stringify(v) : v))
  }
  return parts.join(' · ')
}

export function AuditLogClient({ rows }: { rows: AuditViewerRow[] }) {
  const { t } = useLanguage()

  const [q, setQ]               = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [page, setPage]         = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const distinctActions = useMemo(
    () => [...new Set(rows.map(r => r.action))].sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (actionFilter && r.action !== actionFilter) return false
      if (dateFrom && r.created_at.slice(0, 10) < dateFrom) return false
      if (dateTo   && r.created_at.slice(0, 10) > dateTo)   return false
      if (needle) {
        const haystack = [
          r.actor_name, r.action, r.entity_type, r.entity_id,
          r.payload_json ? JSON.stringify(r.payload_json) : '',
        ].join(' ').toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [rows, q, actionFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasFilters = q || actionFilter || dateFrom || dateTo

  const inputStyle = {
    fontSize: 13, padding: '8px 12px', border: '1px solid #E2E8F0',
    borderRadius: 8, background: 'white',
  } as const

  return (
    <div>
      {/* Filter toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
          placeholder={t.audit.searchPlaceholder}
          style={{ ...inputStyle, width: 260 }}
        />
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          style={inputStyle}
        >
          <option value="">{t.audit.allActions}</option>
          {distinctActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.audit.fromDate}
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.audit.toDate}
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} style={inputStyle} />
        </label>
        <span style={{ fontSize: 12, color: '#64748B', marginLeft: 'auto' }}>
          {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} {t.audit.shownSuffix}
        </span>
        {hasFilters && (
          <button
            onClick={() => { setQ(''); setActionFilter(''); setDateFrom(''); setDateTo(''); setPage(1) }}
            style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            × {t.audit.clearFilters}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#F6F8FB', borderBottom: '1px solid #E2E8F0' }}>
              {[t.audit.thWhen, t.audit.thActor, t.audit.thAction, t.audit.thEntity, t.audit.thDetails].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>{t.audit.noRows}</td></tr>
            ) : pageRows.map(r => {
              const isOpen = expandedId === r.log_id
              return (
                <tr
                  key={r.log_id}
                  onClick={() => setExpandedId(isOpen ? null : r.log_id)}
                  style={{ borderTop: '1px solid #F1F5F9', cursor: 'pointer', background: isOpen ? '#F8FAFC' : undefined }}
                >
                  <td style={{ padding: '8px 12px', color: '#64748B', whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, verticalAlign: 'top' }}>
                    {fmtDateTime(r.created_at)}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#15233A', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {r.actor_name ?? <em style={{ color: '#94A3B8' }}>{t.audit.systemActor}</em>}
                  </td>
                  <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                    <ActionChip action={r.action} />
                  </td>
                  <td style={{ padding: '8px 12px', color: '#64748B', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {r.entity_type ?? '—'}
                    {r.entity_id && (
                      <span style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#94A3B8' }}>
                        {r.entity_id.length > 12 ? `${r.entity_id.slice(0, 12)}…` : r.entity_id}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#475569', verticalAlign: 'top', maxWidth: 380 }}>
                    {isOpen ? (
                      <pre style={{ margin: 0, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#334155', background: '#F1F5F9', borderRadius: 6, padding: 8 }}>
                        {JSON.stringify(r.payload_json ?? {}, null, 2)}
                      </pre>
                    ) : (
                      <span style={{ fontSize: 11, lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                        {summarizePayload(r.payload_json) || '—'}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12, fontSize: 12, color: '#64748B' }}>
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.5 : 1 }}
        >
          ← {t.adminDb.prevPage}
        </button>
        <span>{safePage} / {totalPages}</span>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages ? 0.5 : 1 }}
        >
          {t.adminDb.nextPage} →
        </button>
      </div>
    </div>
  )
}
