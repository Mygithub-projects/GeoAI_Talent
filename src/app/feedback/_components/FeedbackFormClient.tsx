'use client'

// Phase 9 — the public trainer feedback form. Rendered only after the
// server page validated the token; the submit route re-validates it
// server-side regardless (never trust client-held state).

import { useState } from 'react'
import Image from 'next/image'
import { getTranslations } from '@/i18n'
import { PublicLanguageToggle } from '@/components/PublicLanguageToggle'
import { Textarea } from '@/components/ui/Textarea'
import { RatingInput } from './RatingInput'
import { FeedbackStatus, type FeedbackStatusKind } from './FeedbackStatus'
import type { FeedbackTokenContext } from '@/lib/feedbackToken'

interface Props {
  token:   string
  context: Omit<FeedbackTokenContext, 'token_id'>
  initialLocale: 'en' | 'bm'   // the language the invitation email used
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type RatingKey =
  | 'rating_content'
  | 'rating_materials'
  | 'rating_venue_logistics'
  | 'rating_communication'
  | 'rating_overall'

export function FeedbackFormClient({ token, context, initialLocale }: Props) {
  const [locale, setLocale] = useState<'en' | 'bm'>(initialLocale)
  const f = getTranslations(locale).feedback

  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    rating_content:         null,
    rating_materials:       null,
    rating_venue_logistics: null,
    rating_communication:   null,
    rating_overall:         null,
  })
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null)
  const [comments, setComments]             = useState('')
  const [showErrors, setShowErrors]         = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [error, setError]                   = useState('')
  const [terminal, setTerminal]             = useState<FeedbackStatusKind | null>(null)

  if (terminal) return <FeedbackStatus state={terminal} initialLocale={locale} />

  const ratingFields: Array<{ key: RatingKey; label: string }> = [
    { key: 'rating_content',         label: f.ratingContent },
    { key: 'rating_materials',       label: f.ratingMaterials },
    { key: 'rating_venue_logistics', label: f.ratingVenue },
    { key: 'rating_communication',   label: f.ratingCommunication },
    { key: 'rating_overall',         label: f.ratingOverall },
  ]

  const allValid = ratingFields.every(r => ratings[r.key] != null) && wouldRecommend != null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allValid) {
      setShowErrors(true)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/feedback/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...ratings,
          would_recommend: wouldRecommend,
          comments,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        // A stale token (used/expired since page load) gets its proper panel
        if (body?.reason === 'already_submitted' || body?.reason === 'expired' || body?.reason === 'invalid') {
          setTerminal(body.reason as FeedbackStatusKind)
          return
        }
        throw new Error(body?.error ?? 'Failed to submit feedback')
      }
      setTerminal('success')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const dateRange = context.start_date === context.end_date
    ? fmtDate(context.start_date)
    : `${fmtDate(context.start_date)} – ${fmtDate(context.end_date)}`

  const segBtn = (active: boolean) => [
    'rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-royal-blue/40',
    active
      ? 'bg-royal-blue text-white shadow-sm'
      : 'bg-white text-slate border border-border hover:border-muted/60',
  ].join(' ')

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Trainers are not system users — the logo is deliberately not a link. */}
      <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={109} height={36} className="h-8 w-auto" />
        <PublicLanguageToggle value={locale} onChange={setLocale} />
      </div>

      <div className="flex flex-1 justify-center px-4 py-10">
        <div className="w-full max-w-xl animate-fade-up">
          <h1 className="font-display text-2xl font-semibold text-slate">{f.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {f.intro.replace('{name}', context.trainer_name ?? '')}
          </p>

          {/* Workshop details card */}
          <div className="mt-5 rounded-xl border border-border bg-white p-4 shadow-card"
               style={{ borderLeft: '4px solid #1E63C4' }}>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-24 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5">{f.programmeLabel}</dt>
                <dd className="font-semibold text-ink-navy">{context.training_title ?? '—'}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5">{f.venueLabel}</dt>
                <dd className="text-slate">{context.venue_name ?? '—'}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5">{f.datesLabel}</dt>
                <dd className="text-slate">{dateRange}</dd>
              </div>
            </dl>
            {context.deadline_at && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                {f.deadlineNote.replace('{date}', fmtDate(context.deadline_at))}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-6 rounded-xl border border-border bg-white p-6 shadow-card">
            {ratingFields.map(r => (
              <RatingInput
                key={r.key}
                label={r.label}
                value={ratings[r.key]}
                onChange={n => setRatings(prev => ({ ...prev, [r.key]: n }))}
                error={showErrors && ratings[r.key] == null ? f.fieldRequired : undefined}
                starLabel={f.starLabel}
              />
            ))}

            {/* Would-recommend segmented toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate">{f.wouldRecommendLabel}</span>
              <div className="flex items-center gap-2" role="radiogroup" aria-label={f.wouldRecommendLabel}>
                <button type="button" role="radio" aria-checked={wouldRecommend === true}
                        onClick={() => setWouldRecommend(true)} className={segBtn(wouldRecommend === true)}>
                  {f.yes}
                </button>
                <button type="button" role="radio" aria-checked={wouldRecommend === false}
                        onClick={() => setWouldRecommend(false)} className={segBtn(wouldRecommend === false)}>
                  {f.no}
                </button>
              </div>
              {showErrors && wouldRecommend == null && (
                <p className="text-xs text-red-600" role="alert">{f.fieldRequired}</p>
              )}
            </div>

            <Textarea
              label={f.commentsLabel}
              hint={f.commentsHint}
              placeholder={f.commentsPlaceholder}
              value={comments}
              onChange={e => setComments(e.target.value)}
              maxLength={4000}
              rows={5}
            />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error} — {f.retryHint}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-cta-gradient px-6 py-3 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: submitting ? '#94A3B8' : undefined }}
            >
              {submitting ? f.submitting : f.submitBtn}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
