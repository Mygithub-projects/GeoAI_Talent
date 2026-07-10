'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { mergeTemplate } from '@/lib/emailTemplate'
import { buildInvitationEmail } from '@/lib/emailContent'

export interface SelectedTrainer {
  trainer_id:   string
  trainer_name: string
}

export interface SentResult {
  trainer_id: string
  trainer_name: string
  email_sent_to: string | null
  email_delivered: boolean
  token_expires_at: string
}
export interface SkippedResult {
  trainer_id: string
  reason: string
}

interface EmailReviewModalProps {
  open:             boolean
  onClose:          () => void
  engagementId:     string
  selectedTrainers: SelectedTrainer[]
  onSent:           (results: { sent: SentResult[]; skipped: SkippedResult[] }) => void
}

export function EmailReviewModal({ open, onClose, engagementId, selectedTrainers, onSent }: EmailReviewModalProps) {
  const { t } = useLanguage()
  const [subject, setSubject]   = useState('')
  const [message, setMessage]   = useState('')
  const [venueName, setVenueName]         = useState('')
  const [trainingTitle, setTrainingTitle] = useState('')
  const [startDate, setStartDate]         = useState<string | null>(null)
  const [endDate, setEndDate]             = useState<string | null>(null)
  const [expiresAt, setExpiresAt]         = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string>(selectedTrainers[0]?.trainer_id ?? '')
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [sending, setSending]   = useState(false)
  const [results, setResults]   = useState<{ sent: SentResult[]; skipped: SkippedResult[] } | null>(null)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on close, not a derived-state anti-pattern
      setResults(null)
      setError(null)
      return
    }
    setPreviewId(selectedTrainers[0]?.trainer_id ?? '')
    setLoadingDraft(true)
    fetch('/api/engagements/invite/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engagement_id: engagementId, trainer_ids: selectedTrainers.map(t => t.trainer_id) }),
    })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load draft')
        }
        setSubject(data.subject ?? '')
        setMessage(data.message ?? '')
        setVenueName(data.venue_name ?? '')
        setTrainingTitle(data.training_title ?? '')
        setStartDate(data.start_date ?? null)
        setEndDate(data.end_date ?? null)
        setExpiresAt(data.expires_at ?? null)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load draft'))
      .finally(() => setLoadingDraft(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engagementId])

  if (!open) return null

  const previewTrainerName = selectedTrainers.find(t => t.trainer_id === previewId)?.trainer_name ?? ''
  const mergedPreview = expiresAt
    ? buildInvitationEmail({
        lang:          'bm',
        customMessage: mergeTemplate(message, { trainer_name: previewTrainerName }),
        trainingTitle,
        venueName,
        startDate,
        endDate,
        acceptUrl:     '{{accept_url}}',
        declineUrl:    '{{decline_url}}',
        expiresAt:     new Date(expiresAt),
      }).html
    : ''

  async function handleSend(trainerIds: string[]) {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/engagements/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagement_id: engagementId, trainer_ids: trainerIds, subject, message }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to send invitations')
        return
      }
      setResults(prev => prev
        ? { sent: [...prev.sent, ...data.sent], skipped: data.skipped ?? [] }
        : { sent: data.sent ?? [], skipped: data.skipped ?? [] })
    } catch {
      setError('Network error while sending invitations')
    } finally {
      setSending(false)
    }
  }

  function handleDone() {
    if (results) onSent(results)
    onClose()
  }

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.55)', padding: 16,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          background: 'white', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ background: '#0E2F57', color: 'white', padding: '14px 20px', borderRadius: '14px 14px 0 0' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{t.batchInvite.reviewModalTitle}</h2>
        </div>

        <div style={{ padding: 20 }}>
          {!results ? (
            <>
              {loadingDraft ? (
                <p style={{ fontSize: 12, color: '#64748B' }}>{t.common.loading}</p>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {t.batchInvite.subjectLabel}
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8 }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {t.batchInvite.bodyLabel}
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={6}
                      style={{ width: '100%', fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.6, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, resize: 'vertical' }}
                    />
                  </div>
                  <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 0, marginBottom: 16 }}>
                    {t.batchInvite.mergeFieldsHint}
                  </p>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        {t.batchInvite.previewAsLabel}
                      </label>
                      <select
                        value={previewId}
                        onChange={e => setPreviewId(e.target.value)}
                        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #E2E8F0', borderRadius: 6 }}
                      >
                        {selectedTrainers.map(st => (
                          <option key={st.trainer_id} value={st.trainer_id}>{st.trainer_name}</option>
                        ))}
                      </select>
                    </div>
                    <iframe
                      title="Email preview"
                      srcDoc={mergedPreview}
                      style={{ width: '100%', height: 260, border: '1px solid #E2E8F0', borderRadius: 8 }}
                    />
                    <p style={{ fontSize: 9, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' }}>
                      {t.batchInvite.previewLinkNote}
                    </p>
                  </div>

                  {error && <p style={{ fontSize: 11, color: '#B91C1C', marginBottom: 10 }}>{error}</p>}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      onClick={onClose}
                      style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      onClick={() => handleSend(selectedTrainers.map(t => t.trainer_id))}
                      disabled={sending || !subject || !message}
                      style={{
                        fontSize: 12, fontWeight: 700, color: 'white', background: '#12B5AC',
                        border: 'none', borderRadius: 8, padding: '8px 16px',
                        cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1,
                      }}
                    >
                      {sending ? t.batchInvite.sending : `${t.batchInvite.sendToAll} ${selectedTrainers.length}`}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0E2F57', marginTop: 0, marginBottom: 10 }}>
                {t.batchInvite.sendResultsTitle}
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 14 }}>
                {results.sent.map(r => (
                  <li key={r.trainer_id} style={{ fontSize: 12, color: r.email_delivered ? '#0F766E' : '#92400E', padding: '4px 0' }}>
                    {r.email_delivered
                      ? <>✓ {r.trainer_name} — {t.batchInvite.sendSuccessOne}</>
                      : <>⚠ {r.trainer_name} — {t.batchInvite.sentNoEmail}</>}
                  </li>
                ))}
                {results.skipped.map(r => (
                  <li key={r.trainer_id} style={{ fontSize: 12, color: '#B91C1C', padding: '4px 0' }}>
                    ✗ {r.trainer_id} — {t.batchInvite.sendFailedOne} ({r.reason})
                  </li>
                ))}
              </ul>

              {error && <p style={{ fontSize: 11, color: '#B91C1C', marginBottom: 10 }}>{error}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {results.skipped.length > 0 && (
                  <button
                    onClick={() => handleSend(results.skipped.map(s => s.trainer_id))}
                    disabled={sending}
                    style={{ fontSize: 12, fontWeight: 600, color: '#0E2F57', background: '#FEF3C7', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: sending ? 'not-allowed' : 'pointer' }}
                  >
                    {t.batchInvite.retryFailed}
                  </button>
                )}
                <button
                  onClick={handleDone}
                  style={{ fontSize: 12, fontWeight: 700, color: 'white', background: '#0E2F57', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                >
                  {t.batchInvite.done}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
