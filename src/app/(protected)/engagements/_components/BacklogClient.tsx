'use client'

import { useState, useMemo, Fragment } from 'react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────

export interface TrainerInviteRow {
  engagement_trainer_id: string
  trainer_id:        string
  trainer_name:      string | null
  trainer_email:     string | null
  status:            'Pending Invite' | 'Confirmed' | 'Declined'
  invited_at:        string
  responded_at:      string | null
  invite_expires_at: string | null
}

export interface WorkshopRow {
  engagement_id:      string
  training_title:     string | null
  dynamic_venue_name: string | null
  start_date:         string | null
  end_date:           string | null
  trainers_needed:    number
  workflow_status:    string
  created_at:         string
  creator_name:       string | null
  trainers:           TrainerInviteRow[]
  confirmedCount:     number
}

export interface AuditRow {
  log_id:       string
  actor_name:   string
  action:       string
  entity_type:  string | null
  entity_id:    string | null
  payload_json: Record<string, unknown> | null
  created_at:   string
}

// ── Helpers ──────────────────────────────────────────────────────

const BM_MONTHS = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogs','Sep','Okt','Nov','Dis']

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${BM_MONTHS[m - 1]} ${y}`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Mirrors src/lib/engagementRollup.ts recomputeEngagementStatus, for optimistic UI only.
function computeWorkshopStatus(trainers: TrainerInviteRow[], trainersNeeded: number, currentStatus: string): string {
  if (currentStatus === 'Cancelled') return 'Cancelled'
  const confirmed = trainers.filter(t => t.status === 'Confirmed').length
  const pending   = trainers.filter(t => t.status === 'Pending Invite').length
  if (confirmed >= trainersNeeded) return 'Confirmed'
  if (pending > 0) return 'Pending Invite'
  return 'Draft'
}

// ── Micro-components ──────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  'Draft':          { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' },
  'Pending Invite': { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  'Confirmed':      { bg: '#CCFBF1', text: '#0F766E', dot: '#14B8A6' },
  'Declined':       { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
  'Cancelled':      { bg: '#E2E8F0', text: '#64748B', dot: '#94A3B8' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES['Draft']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.text,
      fontSize: 11, fontWeight: 700,
      padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  )
}

function ProgressCell({ confirmedCount, trainersNeeded }: { confirmedCount: number; trainersNeeded: number }) {
  const pct = trainersNeeded > 0 ? Math.min(100, Math.round((confirmedCount / trainersNeeded) * 100)) : 0
  return (
    <div style={{ minWidth: 72 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', fontFamily: 'monospace' }}>
        {confirmedCount}/{trainersNeeded}
      </span>
      <div style={{ marginTop: 3, height: 4, width: '100%', background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#14B8A6', borderRadius: 99 }} />
      </div>
    </div>
  )
}

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  'engagement.invite':   { bg: '#EDE9FE', text: '#5B21B6' },
  'engagement.reinvite': { bg: '#FEF3C7', text: '#92400E' },
  'engagement.confirm':  { bg: '#CCFBF1', text: '#0F766E' },
  'engagement.cancel':   { bg: '#FEE2E2', text: '#B91C1C' },
  'engagement.accept':   { bg: '#CCFBF1', text: '#0F766E' },
  'engagement.decline':  { bg: '#FEE2E2', text: '#B91C1C' },
  'user.approve':        { bg: '#DBEAFE', text: '#1E40AF' },
  'user.suspend':        { bg: '#FEF3C7', text: '#92400E' },
  'user.role_change':    { bg: '#E0E7FF', text: '#3730A3' },
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

function TrainerInviteStatusCell({ row }: { row: TrainerInviteRow }) {
  if (row.status === 'Confirmed')
    return <span style={{ fontSize: 11, color: '#0F766E', fontWeight: 700 }}>✓ Accepted</span>
  if (row.status === 'Declined')
    return <span style={{ fontSize: 11, color: '#B91C1C', fontWeight: 700 }}>✗ Declined</span>
  if (!row.invite_expires_at)
    return <span style={{ color: '#94A3B8' }}>—</span>
  const expired = new Date(row.invite_expires_at) < new Date()
  if (expired)
    return <span style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>Token expired</span>
  return (
    <span style={{ fontSize: 11, color: '#92400E' }}>
      ⏳ Awaiting<br />
      <span style={{ fontSize: 10, color: '#94A3B8' }}>
        exp. {fmtDate(row.invite_expires_at.split('T')[0])}
      </span>
    </span>
  )
}

function AuditDetail({ row }: { row: AuditRow }) {
  const p = row.payload_json
  if (!p) return <span style={{ color: '#94A3B8' }}>—</span>
  const parts: string[] = []
  if (typeof p.trainer_name    === 'string') parts.push(`Trainer: ${p.trainer_name}`)
  if (typeof p.email_sent_to   === 'string') parts.push(`To: ${p.email_sent_to}`)
  if (typeof p.role            === 'string') parts.push(`Role → ${p.role}`)
  if (typeof p.status          === 'string') parts.push(`Status → ${p.status}`)
  if (typeof p.scope           === 'string') parts.push(`Scope: ${p.scope}`)
  if (typeof p.reason          === 'string') parts.push(`Reason: ${p.reason}`)
  if (typeof p.note            === 'string') parts.push(`Note: ${p.note}`)
  if (typeof p.method          === 'string') parts.push(`Via: ${p.method}`)
  if (typeof p.previous_status === 'string') parts.push(`Was: ${p.previous_status}`)
  if (parts.length === 0) {
    Object.keys(p).slice(0, 2).forEach(k => parts.push(`${k}: ${String(p[k]).slice(0, 40)}`))
  }
  return (
    <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
      {parts.map((s, i) => <span key={i} style={{ display: 'block' }}>{s}</span>)}
    </span>
  )
}

// ── Action button ─────────────────────────────────────────────────

interface ActionBtnProps {
  label:     string
  loading:   boolean
  disabled?: boolean
  variant:   'amber' | 'teal' | 'red' | 'slate'
  onClick:   () => void
}

function ActionBtn({ label, loading, disabled, variant, onClick }: ActionBtnProps) {
  const colors = {
    amber: { border: '#F59E0B', text: '#92400E', bg: '#FEF3C7', hover: '#FDE68A' },
    teal:  { border: '#14B8A6', text: '#0F766E', bg: '#CCFBF1', hover: '#99F6E4' },
    red:   { border: '#EF4444', text: '#B91C1C', bg: '#FEE2E2', hover: '#FECACA' },
    slate: { border: '#CBD5E1', text: '#475569', bg: '#F8FAFC', hover: '#E2E8F0' },
  }
  const c = colors[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        fontSize: 10, fontWeight: 700,
        padding: '3px 9px', borderRadius: 6,
        border: `1px solid ${c.border}`,
        background: c.bg, color: c.text,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        whiteSpace: 'nowrap',
        transition: 'background 0.1s',
      }}
    >
      {loading ? '…' : label}
    </button>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────

function StatChip({ label, value, bg, color, active, onClick }: {
  label: string; value: number; bg: string; color: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 10,
      background: active ? bg : '#ffffff',
      border: `1.5px solid ${active ? color : '#E2E8F0'}`,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: active ? color : '#475569', fontFamily: 'monospace' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: active ? color : '#64748B', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  )
}

// ── Workshops table ───────────────────────────────────────────────

interface WorkshopsTableProps {
  rows:              WorkshopRow[]
  expanded:          Set<string>
  onToggleExpand:    (engagementId: string) => void
  rowAction:         Record<string, string | null>
  rowError:          Record<string, string | null>
  onReinvite:        (engId: string, trainerId: string) => void
  onConfirm:         (engId: string, trainerId: string) => void
  onCancelTrainer:   (engId: string, trainerId: string) => void
  onCancelWorkshop:  (engId: string) => void
}

function WorkshopsTable({
  rows, expanded, onToggleExpand, rowAction, rowError, onReinvite, onConfirm, onCancelTrainer, onCancelWorkshop,
}: WorkshopsTableProps) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94A3B8', fontSize: 14 }}>
        No workshops match your filters.
      </div>
    )
  }

  const HEADERS = ['', 'REF', 'WORKSHOP / VENUE', 'DATES', 'PROGRESS', 'STATUS', 'BY', 'WHEN', 'ACTIONS']

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            {HEADERS.map((h, i) => (
              <th key={i} style={{
                padding: '10px 14px', textAlign: 'left',
                fontSize: 10, fontWeight: 700, color: '#94A3B8',
                letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => {
            const isOpen  = expanded.has(w.engagement_id)
            const isDraft = w.workflow_status === 'Draft'
            const isPendingWorkshop = w.workflow_status === 'Pending Invite'
            const workshopCancellable = isDraft || isPendingWorkshop
            const wBusy = rowAction[`eng:${w.engagement_id}`]

            return (
              <Fragment key={w.engagement_id}>
                <tr
                  style={{ borderBottom: isOpen ? 'none' : '1px solid #F1F5F9', background: i % 2 === 0 ? '#ffffff' : '#FAFCFE', cursor: 'pointer' }}
                  onClick={() => onToggleExpand(w.engagement_id)}
                >
                  <td style={{ padding: '10px 8px', verticalAlign: 'top', width: 20 }}>
                    <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: '#94A3B8' }}>▸</span>
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                    <span title={w.engagement_id}
                      style={{ fontFamily: 'monospace', fontSize: 11, color: '#1E63C4', letterSpacing: '0.3px' }}>
                      {w.engagement_id.slice(0, 8)}…
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top', maxWidth: 200 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#0E2F57', lineHeight: 1.3 }}>
                      {w.training_title ?? <em style={{ fontWeight: 400, color: '#94A3B8' }}>Untitled</em>}
                    </p>
                    {w.dynamic_venue_name && (
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>
                        📍 {w.dynamic_venue_name}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {w.start_date ? (
                      <span style={{ color: '#334155' }}>
                        {fmtDate(w.start_date)}
                        {w.end_date && w.end_date !== w.start_date && (
                          <><br /><span style={{ color: '#94A3B8' }}>→ {fmtDate(w.end_date)}</span></>
                        )}
                      </span>
                    ) : <span style={{ color: '#94A3B8' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                    <ProgressCell confirmedCount={w.confirmedCount} trainersNeeded={w.trainers_needed} />
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                    <StatusBadge status={w.workflow_status} />
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#475569' }}>{w.creator_name ?? '—'}</span>
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#94A3B8', fontSize: 11 }}>{relTime(w.created_at)}</span><br />
                    <span style={{ color: '#CBD5E1', fontSize: 10 }}>{fmtDateTime(w.created_at).split(',')[0]}</span>
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top' }} onClick={e => e.stopPropagation()}>
                    {workshopCancellable ? (
                      <ActionBtn label="Cancel workshop" variant="red"
                        loading={wBusy === 'cancel'} disabled={!!wBusy}
                        onClick={() => onCancelWorkshop(w.engagement_id)} />
                    ) : (
                      <span style={{ color: '#CBD5E1', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>

                {isOpen && (
                  <tr key={`${w.engagement_id}-detail`} style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                    <td colSpan={HEADERS.length} style={{ padding: '4px 14px 14px 42px' }}>
                      {w.trainers.length === 0 ? (
                        <p style={{ fontSize: 12, color: '#94A3B8', margin: '8px 0' }}>No trainers invited yet.</p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              {['TRAINER', 'STATUS', 'INVITE', 'INVITED', 'ACTIONS'].map(h => (
                                <th key={h} style={{
                                  padding: '6px 10px', textAlign: 'left',
                                  fontSize: 9, fontWeight: 700, color: '#94A3B8',
                                  letterSpacing: '0.5px', textTransform: 'uppercase',
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {w.trainers.map(tr => {
                              const key = `trn:${w.engagement_id}:${tr.trainer_id}`
                              const busy   = rowAction[key]
                              const errMsg = rowError[key]
                              const isPending = tr.status === 'Pending Invite'
                              return (
                                <tr key={tr.engagement_trainer_id} style={{ borderTop: '1px solid #E2E8F0' }}>
                                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                    <p style={{ margin: 0, fontWeight: 600, color: '#0E2F57' }}>{tr.trainer_name ?? tr.trainer_id}</p>
                                    {tr.trainer_email && (
                                      <p style={{ margin: '1px 0 0', fontSize: 10, color: '#94A3B8', wordBreak: 'break-all' }}>{tr.trainer_email}</p>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                    <StatusBadge status={tr.status} />
                                  </td>
                                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                    <TrainerInviteStatusCell row={tr} />
                                  </td>
                                  <td style={{ padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: '#94A3B8', fontSize: 11 }}>{relTime(tr.invited_at)}</span>
                                  </td>
                                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {isPending && (
                                        <ActionBtn label="Re-invite" variant="amber"
                                          loading={busy === 'reinvite'} disabled={!!busy}
                                          onClick={() => onReinvite(w.engagement_id, tr.trainer_id)} />
                                      )}
                                      {isPending && (
                                        <ActionBtn label="✓ Confirm" variant="teal"
                                          loading={busy === 'confirm'} disabled={!!busy}
                                          onClick={() => onConfirm(w.engagement_id, tr.trainer_id)} />
                                      )}
                                      {isPending && (
                                        <ActionBtn label="Withdraw" variant="red"
                                          loading={busy === 'cancel'} disabled={!!busy}
                                          onClick={() => onCancelTrainer(w.engagement_id, tr.trainer_id)} />
                                      )}
                                      {!isPending && <span style={{ color: '#CBD5E1', fontSize: 11 }}>—</span>}
                                      {errMsg && (
                                        <span style={{ fontSize: 10, color: '#B91C1C', marginTop: 2 }}>⚠ {errMsg}</span>
                                      )}
                                    </div>
                                  </td>
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
  )
}

// ── Audit table ───────────────────────────────────────────────────

function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94A3B8', fontSize: 14 }}>
        No audit log entries yet.
      </div>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            {['WHEN', 'ACTOR', 'ACTION', 'ENTITY', 'DETAILS'].map(h => (
              <th key={h} style={{
                padding: '10px 14px', textAlign: 'left',
                fontSize: 10, fontWeight: 700, color: '#94A3B8',
                letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.log_id}
              style={{ borderBottom: '1px solid #F1F5F9', background: i % 2 === 0 ? '#ffffff' : '#FAFCFE' }}
            >
              <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#334155', fontSize: 11 }}>{fmtDateTime(row.created_at)}</span><br />
                <span style={{ color: '#94A3B8', fontSize: 10 }}>{relTime(row.created_at)}</span>
              </td>
              <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 600, color: '#0E2F57' }}>{row.actor_name}</span>
              </td>
              <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                <ActionChip action={row.action} />
              </td>
              <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                {row.entity_type ? (
                  <>
                    <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{row.entity_type}</span>
                    {row.entity_id && (
                      <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontSize: 10, color: '#94A3B8' }}>
                        {row.entity_id.slice(0, 8)}…
                      </p>
                    )}
                  </>
                ) : <span style={{ color: '#94A3B8' }}>—</span>}
              </td>
              <td style={{ padding: '10px 14px', verticalAlign: 'top', maxWidth: 280 }}>
                <AuditDetail row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────

interface BacklogClientProps {
  workshops: WorkshopRow[]
  auditLog:  AuditRow[]
  isAdmin:   boolean
  scope:     'mine' | 'all'
}

export function BacklogClient({ workshops: initialWorkshops, auditLog, isAdmin, scope }: BacklogClientProps) {
  const [tab, setTab]             = useState<'engagements' | 'audit'>('engagements')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery]   = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())

  // Local copy so we can optimistically update rows
  const [rows, setRows] = useState<WorkshopRow[]>(initialWorkshops)
  const [rowAction, setRowAction] = useState<Record<string, string | null>>({})
  const [rowError,  setRowError]  = useState<Record<string, string | null>>({})

  function toggleExpand(engId: string) {
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(engId)) next.delete(engId)
      else next.add(engId)
      return next
    })
  }

  // ── Action helpers ───────────────────────────────────────────────
  async function callAction(
    key: string,
    url: string,
    body: object,
    onSuccess: (data: Record<string, unknown>) => void,
  ) {
    setRowAction(s => ({ ...s, [key]: url.split('/').pop() ?? null }))
    setRowError(s => ({ ...s, [key]: null }))
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed')
      onSuccess(data)
    } catch (e) {
      setRowError(s => ({ ...s, [key]: (e as Error).message.slice(0, 60) }))
    } finally {
      setRowAction(s => ({ ...s, [key]: null }))
    }
  }

  function updateTrainer(engId: string, trainerId: string, patch: Partial<TrainerInviteRow>) {
    setRows(s => s.map(w => {
      if (w.engagement_id !== engId) return w
      const trainers = w.trainers.map(t => t.trainer_id !== trainerId ? t : { ...t, ...patch })
      const confirmedCount = trainers.filter(t => t.status === 'Confirmed').length
      return {
        ...w,
        trainers,
        confirmedCount,
        workflow_status: computeWorkshopStatus(trainers, w.trainers_needed, w.workflow_status),
      }
    }))
  }

  function handleReinvite(engId: string, trainerId: string) {
    callAction(`trn:${engId}:${trainerId}`, '/api/engagements/reinvite', { engagement_id: engId, trainer_id: trainerId }, (data) => {
      updateTrainer(engId, trainerId, { invite_expires_at: data.token_expires_at as string, responded_at: null })
    })
  }

  function handleConfirm(engId: string, trainerId: string) {
    if (!window.confirm('Mark this trainer as Confirmed? This records an off-system confirmation.')) return
    callAction(`trn:${engId}:${trainerId}`, '/api/engagements/confirm', { engagement_id: engId, trainer_id: trainerId }, () => {
      updateTrainer(engId, trainerId, { status: 'Confirmed', responded_at: new Date().toISOString() })
    })
  }

  function handleCancelTrainer(engId: string, trainerId: string) {
    const reason = window.prompt('Reason for withdrawing this invite (optional):')
    if (reason === null) return
    callAction(`trn:${engId}:${trainerId}`, '/api/engagements/cancel', { engagement_id: engId, trainer_id: trainerId, reason: reason || undefined }, () => {
      updateTrainer(engId, trainerId, { status: 'Declined', responded_at: new Date().toISOString() })
    })
  }

  function handleCancelWorkshop(engId: string) {
    const reason = window.prompt('Reason for cancelling this workshop (optional):')
    if (reason === null) return
    callAction(`eng:${engId}`, '/api/engagements/cancel', { engagement_id: engId, reason: reason || undefined }, () => {
      setRows(s => s.map(w => w.engagement_id !== engId ? w : { ...w, workflow_status: 'Cancelled' }))
    })
  }

  // ── Filtering ────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return rows.filter(w => {
      if (statusFilter) {
        if (statusFilter === 'Draft' || statusFilter === 'Cancelled') {
          if (w.workflow_status !== statusFilter) return false
        } else if (!w.trainers.some(t => t.status === statusFilter)) {
          return false
        }
      }
      if (q) {
        const haystack = [w.training_title, w.dynamic_venue_name, w.creator_name, ...w.trainers.map(t => t.trainer_name)]
          .join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (dateFrom && w.start_date && w.start_date < dateFrom) return false
      if (dateTo   && w.start_date && w.start_date > dateTo)   return false
      return true
    })
  }, [rows, statusFilter, searchQuery, dateFrom, dateTo])

  const flatTrainers = useMemo(() => rows.flatMap(w => w.trainers), [rows])

  const STAT_CHIPS = [
    { label: 'All',            status: null,             bg: '#EFF6FF', color: '#1E63C4', value: rows.length },
    { label: 'Draft',          status: 'Draft',          bg: '#F1F5F9', color: '#475569', value: rows.filter(w => w.workflow_status === 'Draft').length },
    { label: 'Pending Invite', status: 'Pending Invite', bg: '#FEF3C7', color: '#92400E', value: flatTrainers.filter(t => t.status === 'Pending Invite').length },
    { label: 'Confirmed',      status: 'Confirmed',      bg: '#CCFBF1', color: '#0F766E', value: flatTrainers.filter(t => t.status === 'Confirmed').length },
    { label: 'Declined',       status: 'Declined',       bg: '#FEE2E2', color: '#B91C1C', value: flatTrainers.filter(t => t.status === 'Declined').length },
  ]

  const hasFilters = !!searchQuery || !!dateFrom || !!dateTo || !!statusFilter

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#F6F8FB', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Page header ── */}
      <div style={{ background: '#0E2F57', padding: '20px 28px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 4px' }}>
            GEO-TALENT AGENT{isAdmin ? ' · Admin' : ''}
          </p>
          <h1 style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '0.3px' }}>
            {scope === 'mine' ? 'My Engagements' : 'All Activity'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '4px 0 0' }}>
            Workshops, trainer invitations, and audit trail.
          </p>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, padding: 3 }}>
            {(['all', 'mine'] as const).map(s => (
              <Link
                key={s}
                href={`/engagements?scope=${s}`}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                  textDecoration: 'none',
                  background: scope === s ? '#12B5AC' : 'transparent',
                  color: scope === s ? '#0E2F57' : 'rgba(255,255,255,0.7)',
                }}
              >
                {s === 'all' ? 'All Activity' : 'My Engagements'}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Stat chips ── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {STAT_CHIPS.map(chip => (
            <StatChip key={chip.label}
              label={chip.label} value={chip.value} bg={chip.bg} color={chip.color}
              active={statusFilter === chip.status}
              onClick={() => { setStatusFilter(p => p === chip.status ? null : chip.status); setTab('engagements') }}
            />
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F0' }}>
          {[
            { key: 'engagements', label: `Workshops (${rows.length})` },
            { key: 'audit',       label: `Audit Log (${auditLog.length})` },
          ].map(t => (
            <button key={t.key}
              onClick={() => { setTab(t.key as 'engagements' | 'audit'); setStatusFilter(null) }}
              style={{
                padding: '10px 20px', fontSize: 13, fontWeight: 600,
                border: 'none', background: 'transparent',
                borderBottom: tab === t.key ? '2px solid #1E63C4' : '2px solid transparent',
                marginBottom: -2,
                color: tab === t.key ? '#1E63C4' : '#64748B',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Search / filter toolbar (Engagements tab only) ── */}
        {tab === 'engagements' && (
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
            background: '#ffffff', border: '1px solid #E2E8F0',
            borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 1px 4px rgba(14,47,87,0.05)',
          }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
                width="14" height="14" fill="none" stroke="#475569" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text" placeholder="Search trainer, title, venue…"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', paddingLeft: 30, paddingRight: 10,
                  paddingTop: 7, paddingBottom: 7,
                  border: '1px solid #E2E8F0', borderRadius: 8,
                  fontSize: 12, color: '#334155',
                  outline: 'none', background: '#F8FAFC',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Date range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>Training from</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{
                  border: '1px solid #E2E8F0', borderRadius: 8,
                  fontSize: 12, color: '#334155', padding: '6px 8px',
                  background: '#F8FAFC', outline: 'none',
                }} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{
                  border: '1px solid #E2E8F0', borderRadius: 8,
                  fontSize: 12, color: '#334155', padding: '6px 8px',
                  background: '#F8FAFC', outline: 'none',
                }} />
            </div>

            {/* Results count + clear */}
            {hasFilters && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <span style={{ fontSize: 12, color: '#1E63C4', fontWeight: 600 }}>
                  {filteredRows.length} of {rows.length} shown
                </span>
                <button onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); setStatusFilter(null) }}
                  style={{
                    fontSize: 11, fontWeight: 700, color: '#64748B',
                    background: '#F1F5F9', border: '1px solid #E2E8F0',
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  }}>
                  × Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Table card ── */}
        <div style={{
          background: '#ffffff', borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(14,47,87,0.06)',
          overflow: 'hidden',
        }}>
          {tab === 'engagements'
            ? <WorkshopsTable
                rows={filteredRows}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                rowAction={rowAction} rowError={rowError}
                onReinvite={handleReinvite}
                onConfirm={handleConfirm}
                onCancelTrainer={handleCancelTrainer}
                onCancelWorkshop={handleCancelWorkshop}
              />
            : <AuditTable rows={auditLog} />
          }
        </div>

        <p style={{ fontSize: 11, color: '#CBD5E1', textAlign: 'center', margin: 0 }}>
          Showing up to 200 workshops and 100 audit log entries · Sorted newest first
        </p>
      </div>
    </div>
  )
}
