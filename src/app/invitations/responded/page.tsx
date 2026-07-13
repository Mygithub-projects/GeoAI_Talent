'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useLanguage } from '@/i18n/LanguageProvider'
import { LanguageToggle } from '@/components/LanguageToggle'

type Result = 'accepted' | 'declined' | 'expired' | 'already_used' | 'invalid'
type Tone = 'success' | 'warning' | 'error'

const TONE_STYLES: Record<Tone, { bg: string; icon: string; path: string }> = {
  success: { bg: 'bg-teal/10',        icon: 'text-teal',        path: 'M5 13l4 4L19 7' },
  warning: { bg: 'bg-amber/10',       icon: 'text-amber',       path: 'M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.66 20h18.68a1 1 0 00.85-1.44l-8.48-14.7a1 1 0 00-1.72 0z' },
  error:   { bg: 'bg-[#EF4444]/10',   icon: 'text-[#EF4444]',   path: 'M6 18L18 6M6 6l12 12' },
}

function ResponseContent() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const result = (searchParams.get('result') as Result) || 'invalid'

  const copy: Record<Result, { title: string; message: string; tone: Tone }> = {
    accepted:     { title: t.invitationResponse.acceptedTitle,    message: t.invitationResponse.acceptedMessage,    tone: 'success' },
    declined:     { title: t.invitationResponse.declinedTitle,    message: t.invitationResponse.declinedMessage,    tone: 'warning' },
    expired:      { title: t.invitationResponse.expiredTitle,     message: t.invitationResponse.expiredMessage,     tone: 'error' },
    already_used: { title: t.invitationResponse.alreadyUsedTitle, message: t.invitationResponse.alreadyUsedMessage, tone: 'warning' },
    invalid:      { title: t.invitationResponse.invalidTitle,     message: t.invitationResponse.invalidMessage,     tone: 'error' },
  }

  const { title, message, tone } = copy[result] ?? copy.invalid
  const style = TONE_STYLES[tone]

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Trainers are not system users — the logo is NOT a link and there
          is no "return to the app" affordance anywhere on this page. */}
      <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={160} height={36} className="h-8 w-auto" />
        <LanguageToggle />
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

          <p className="text-xs text-muted">{t.invitationResponse.closeNote}</p>
        </div>
      </div>
    </div>
  )
}

export default function InvitationRespondedPage() {
  return (
    <Suspense fallback={null}>
      <ResponseContent />
    </Suspense>
  )
}
