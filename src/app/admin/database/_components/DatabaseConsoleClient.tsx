'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { ADMIN_TABLES, ADMIN_TABLE_NAMES, type AdminColumnDef, type AdminTableDef } from '@/lib/adminTables'

type Row = Record<string, unknown>

const PAGE_SIZE = 25

function colLabel(col: AdminColumnDef, locale: string) {
  return locale === 'bm' ? col.labelBm : col.labelEn
}
function tableLabel(def: AdminTableDef, locale: string) {
  return locale === 'bm' ? def.labelBm : def.labelEn
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

// ── Row editor modal (create + edit share it) ────────────────────
interface RowModalProps {
  def:      AdminTableDef
  locale:   string
  mode:     'create' | 'edit'
  initial:  Row | null            // edit: the row being edited
  saving:   boolean
  error:    string | null
  onCancel: () => void
  onSave:   (values: Row) => void
  labels:   { title: string; save: string; cancel: string; saving: string }
}

function RowModal({ def, locale, mode, initial, saving, error, onCancel, onSave, labels }: RowModalProps) {
  const [values, setValues] = useState<Row>(() => {
    const v: Row = {}
    for (const col of def.columns) {
      if (mode === 'create' && col.name === def.primaryKey && def.pkAuto) continue
      v[col.name] = initial ? displayValue(initial[col.name]) : ''
    }
    return v
  })

  const formCols = def.columns.filter(col => {
    if (col.name !== def.primaryKey) return true
    // PK: shown on create only when user-supplied; never editable on edit
    return mode === 'create' && !def.pkAuto
  })

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.55)', padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          background: 'white', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ background: '#0E2F57', color: 'white', padding: '14px 20px', borderRadius: '14px 14px 0 0' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            {labels.title} — {tableLabel(def, locale)}
          </h2>
        </div>

        <div style={{ padding: 20 }}>
          {formCols.map(col => (
            <div key={col.name} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {colLabel(col, locale)}{col.required ? ' *' : ''}
              </label>
              {col.type === 'textarea' ? (
                <textarea
                  value={String(values[col.name] ?? '')}
                  onChange={e => setValues(v => ({ ...v, [col.name]: e.target.value }))}
                  rows={4}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, resize: 'vertical' }}
                />
              ) : col.type === 'select' ? (
                <select
                  value={String(values[col.name] ?? '')}
                  onChange={e => setValues(v => ({ ...v, [col.name]: e.target.value }))}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white' }}
                >
                  <option value=""></option>
                  {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={col.type === 'date' ? 'date' : 'text'}
                  value={String(values[col.name] ?? '')}
                  onChange={e => setValues(v => ({ ...v, [col.name]: e.target.value }))}
                  placeholder={col.type === 'tags' ? 'tag1, tag2, …' : col.type === 'number' || col.type === 'integer' ? '0' : undefined}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8 }}
                />
              )}
            </div>
          ))}

          {error && <p style={{ fontSize: 11, color: '#B91C1C', marginBottom: 10 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button
              onClick={onCancel}
              style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
            >
              {labels.cancel}
            </button>
            <button
              onClick={() => onSave(values)}
              disabled={saving}
              style={{
                fontSize: 12, fontWeight: 700, color: 'white', background: '#12B5AC',
                border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? labels.saving : labels.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main console ─────────────────────────────────────────────────
export function DatabaseConsoleClient() {
  const { t, locale } = useLanguage()

  const [activeTable, setActiveTable] = useState<string>(ADMIN_TABLE_NAMES[0])
  const def = ADMIN_TABLES[activeTable]

  const [rows, setRows]       = useState<Row[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [q, setQ]             = useState('')
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [modal, setModal]         = useState<{ mode: 'create' | 'edit'; row: Row | null } | null>(null)
  const [saving, setSaving]       = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [deletingPk, setDeletingPk] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(q), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q])

  const fetchRows = useCallback(async (table: string, pageNum: number, search: string) => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({ page: String(pageNum), pageSize: String(PAGE_SIZE) })
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/tables/${table}?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load rows')
      setRows(data.rows ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setListError((e as Error).message)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-filter-change effect, not derived state (same pattern as DashboardMap)
    fetchRows(activeTable, page, debouncedQ)
  }, [activeTable, page, debouncedQ, fetchRows])

  function switchTable(name: string) {
    setActiveTable(name)
    setPage(1)
    setQ('')
    setDebouncedQ('')
    setListError(null)
    // Clear immediately — the old table's rows lack the new table's
    // primary-key column, which briefly renders duplicate empty keys
    setRows([])
    setTotal(0)
  }

  async function handleSave(values: Row) {
    if (!modal) return
    setSaving(true)
    setModalError(null)
    try {
      const isEdit = modal.mode === 'edit'
      const res = await fetch(`/api/admin/tables/${activeTable}`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit
          ? { pk: modal.row?.[def.primaryKey], values }
          : values),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      setModal(null)
      fetchRows(activeTable, page, debouncedQ)
    } catch (e) {
      setModalError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row: Row) {
    const pk = row[def.primaryKey]
    if (!window.confirm(`${t.adminDb.deleteConfirm} (${def.primaryKey}: ${displayValue(pk)})`)) return
    setDeletingPk(String(pk))
    setListError(null)
    try {
      const res = await fetch(`/api/admin/tables/${activeTable}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Delete failed')
      fetchRows(activeTable, page, debouncedQ)
    } catch (e) {
      setListError((e as Error).message)
    } finally {
      setDeletingPk(null)
    }
  }

  const gridCols = [
    def.columns.find(c => c.name === def.primaryKey),
    ...def.columns.filter(c => c.name !== def.primaryKey),
  ].filter(Boolean) as AdminColumnDef[]
  // PK of tables with pkAuto isn't in columns[] — show it anyway, first.
  const showPkExtra = !def.columns.some(c => c.name === def.primaryKey)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      {/* Table tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {ADMIN_TABLE_NAMES.map(name => {
          const active = name === activeTable
          return (
            <button
              key={name}
              onClick={() => switchTable(name)}
              style={{
                fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? 'white' : '#0E2F57',
                background: active ? '#0E2F57' : 'white',
                border: '1px solid ' + (active ? '#0E2F57' : '#E2E8F0'),
                borderRadius: 99, padding: '6px 14px', cursor: 'pointer',
              }}
            >
              {tableLabel(ADMIN_TABLES[name], locale)}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
          placeholder={`${t.adminDb.searchPlaceholder} (${def.searchColumn})`}
          style={{ fontSize: 13, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, width: 280, background: 'white' }}
        />
        <span style={{ fontSize: 12, color: '#64748B' }}>
          {t.adminDb.totalRows}: {total.toLocaleString()}
        </span>
        <button
          onClick={() => { setModalError(null); setModal({ mode: 'create', row: null }) }}
          style={{
            marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'white',
            background: '#1E63C4', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
          }}
        >
          + {t.adminDb.addRow}
        </button>
      </div>

      {listError && (
        <p style={{ fontSize: 12, color: '#B91C1C', background: '#FEE2E2', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          {listError}
        </p>
      )}

      {/* Grid */}
      <div style={{ overflowX: 'auto', background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
          <thead>
            <tr style={{ background: '#F6F8FB', borderBottom: '1px solid #E2E8F0' }}>
              {showPkExtra && (
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                  {def.primaryKey}
                </th>
              )}
              {gridCols.map(col => (
                <th key={col.name} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                  {colLabel(col, locale)}
                </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#64748B' }}>
                {t.adminDb.actionsCol}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={gridCols.length + 2} style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>{t.common.loading}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={gridCols.length + 2} style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>{t.adminDb.noRows}</td></tr>
            ) : rows.map((row, idx) => {
              const pk = displayValue(row[def.primaryKey])
              return (
                <tr key={pk !== '' ? `${activeTable}:${pk}` : `${activeTable}:#${idx}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                  {showPkExtra && (
                    <td style={{ padding: '8px 12px', color: '#94A3B8', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>{pk}</td>
                  )}
                  {gridCols.map(col => (
                    <td key={col.name} style={{ padding: '8px 12px', color: '#15233A', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayValue(row[col.name])}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => { setModalError(null); setModal({ mode: 'edit', row }) }}
                      style={{ fontSize: 11, fontWeight: 600, color: '#1E63C4', background: 'transparent', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', marginRight: 6 }}
                    >
                      {t.adminDb.editRow}
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      disabled={deletingPk === pk}
                      style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', background: 'transparent', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', cursor: deletingPk === pk ? 'not-allowed' : 'pointer', opacity: deletingPk === pk ? 0.6 : 1 }}
                    >
                      {deletingPk === pk ? '…' : t.adminDb.deleteRow}
                    </button>
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
          disabled={page <= 1 || loading}
          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
        >
          ← {t.adminDb.prevPage}
        </button>
        <span>{page} / {totalPages}</span>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
        >
          {t.adminDb.nextPage} →
        </button>
      </div>

      {modal && (
        <RowModal
          key={`${activeTable}:${modal.mode}:${displayValue(modal.row?.[def.primaryKey])}`}
          def={def}
          locale={locale}
          mode={modal.mode}
          initial={modal.row}
          saving={saving}
          error={modalError}
          onCancel={() => setModal(null)}
          onSave={handleSave}
          labels={{
            title:  modal.mode === 'create' ? t.adminDb.addRow : t.adminDb.editRow,
            save:   t.adminDb.save,
            cancel: t.common.cancel,
            saving: t.adminDb.savingLabel,
          }}
        />
      )}
    </div>
  )
}
