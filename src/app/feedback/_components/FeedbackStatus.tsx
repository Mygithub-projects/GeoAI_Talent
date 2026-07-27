'use client'

// Phase 9 — terminal status panels for the public feedback page
// (invalid / expired / already-submitted / success). Same
// icon-in-tinted-circle idiom as /invitations/responded.

import { useState } from 'react'
import Image from 'next/image'
import { getTranslations } from '@/i18n'
import { PublicLanguageToggle } from '@/components/PublicLanguageToggle'

export type FeedbackStatusKind = 'invalid' | 'expired' | 'already_submitted' | 'success'
type Tone = 'success' | 'warning' | 'error'

const TONE_STYLES: Record<Tone, { bg: string; icon: string; path: string }> = {
  success: { bg: 'bg-teal/10',      icon: 'text-teal',      path: 'M5 13l4 4L19 7' },
  warning: { bg: 'bg-amber/10',     icon: 'text-amber',     path: 'M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.66 20h18.68a1 1 0 00.85-1.44l-8.48-14.7a1 1 0 00-1.72 0z' },
  error:   { bg: 'bg-[#EF4444]/10', icon: 'text-[#EF4444]', path: 'M6 18L18 6M6 6l12 12' },
}

export function FeedbackStatus({ state, initialLocale = 'bm' }: { state: FeedbackStatusKind; initialLocale?: 'en' | 'bm' }) {
  const [locale, setLocale] = useState<'en' | 'bm'>(initialLocale)
  const f = getTranslations(locale).feedback

  const copy: Record<FeedbackStatusKind, { title: string; message: string; tone: Tone }> = {
    success:           { title: f.successTitle,          message: f.successMessage,          tone: 'success' },
    already_submitted: { title: f.alreadySubmittedTitle, message: f.alreadySubmittedMessage, tone: 'warning' },
    expired:           { title: f.expiredTitle,          message: f.expiredMessage,          tone: 'error' },
    invalid:           { title: f.invalidTitle,          message: f.invalidMessage,          tone: 'error' },
  }

  const { title, message, tone } = copy[state]
  const style = TONE_STYLES[tone]

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Trainers are not system users — the logo is deliberately not a link. */}
      <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={109} height={36} className="h-8 w-auto" />
        <PublicLanguageToggle value={locale} onChange={setLocale} />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md animate-fade-in text-center space-y-6">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${style.bg}`}>
            <svg className={`h-8 w-8 ${style.icon}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={style.path} />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold text-slate">{title}</h1>
            <p className="text-sm text-muted leading-relaxed">{message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
