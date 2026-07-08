'use client'

import { useLanguage } from '@/i18n/LanguageProvider'

function GlobeIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m-18.432 0A8.959 8.959 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  )
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage()

  const segment = (target: 'en' | 'bm', label: string) => (
    <button
      onClick={() => setLocale(target)}
      className={`rounded-full px-3 py-1 font-semibold transition-all duration-150 ${
        locale === target
          ? 'bg-ink-navy text-white shadow-sm'
          : 'text-muted hover:bg-surface hover:text-slate'
      }`}
      aria-pressed={locale === target}
    >
      {label}
    </button>
  )

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-white p-0.5 pl-2.5 text-xs shadow-sm ${className}`}
      role="group"
      aria-label={t.common.language}
    >
      <span className="mr-1 text-muted" aria-hidden>
        <GlobeIcon />
      </span>
      {segment('en', 'EN')}
      {segment('bm', 'BM')}
    </div>
  )
}
