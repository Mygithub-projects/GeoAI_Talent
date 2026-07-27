'use client'

// The human-action gate for invitation responses: a plain HTML form
// POST to /api/invitations/respond. Email scanners prefetch GET links
// but never submit forms, so only a real button press records anything.

import { useState } from 'react'
import Image from 'next/image'
import { getTranslations } from '@/i18n'
import { PublicLanguageToggle } from '@/components/PublicLanguageToggle'

interface Props {
  token:         string
  action:        'accept' | 'decline'
  trainerName:   string | null
  trainingTitle: string | null
  venueName:     string | null
  startDate:     string | null
  endDate:       string | null
  initialLocale: 'en' | 'bm'   // the language the invitation email used
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function ConfirmClient({ token, action, trainerName, trainingTitle, venueName, startDate, endDate, initialLocale }: Props) {
  const [locale, setLocale] = useState<'en' | 'bm'>(initialLocale)
  const c = getTranslations(locale).invitationResponse
  const [submitting, setSubmitting] = useState(false)

  const isAccept = action === 'accept'
  const accent   = isAccept ? '#12B5AC' : '#15233A'
  const dateRange = startDate === endDate
    ? fmtDate(startDate)
    : `${fmtDate(startDate)} – ${fmtDate(endDate)}`

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Trainers are not system users — the logo is deliberately not a link. */}
      <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={109} height={36} className="h-8 w-auto" />
        <PublicLanguageToggle value={locale} onChange={setLocale} />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md animate-fade-in space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="font-display text-2xl font-semibold text-slate">
              {isAccept ? c.confirmAcceptTitle : c.confirmDeclineTitle}
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              {trainerName ? `${trainerName} — ` : ''}
              {isAccept ? c.confirmAcceptMessage : c.confirmDeclineMessage}
            </p>
          </div>

          {/* Workshop details card */}
          <div className="rounded-xl border border-border bg-white p-4 shadow-card" style={{ borderLeft: `4px solid ${accent}` }}>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-20 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5">{c.labelProgramme}</dt>
                <dd className="font-semibold text-ink-navy">{trainingTitle ?? '—'}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5">{c.labelVenue}</dt>
                <dd className="text-slate">{venueName ?? '—'}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5">{c.labelDates}</dt>
                <dd className="text-slate">{dateRange}</dd>
              </div>
            </dl>
          </div>

          <form method="POST" action="/api/invitations/respond" onSubmit={() => setSubmitting(true)}>
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full px-6 py-3 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: accent }}
            >
              {submitting
                ? c.confirmSubmitting
                : (isAccept ? c.confirmAcceptBtn : c.confirmDeclineBtn)}
            </button>
          </form>

          <p className="text-center text-xs text-muted">{c.confirmNote}</p>
        </div>
      </div>
    </div>
  )
}
