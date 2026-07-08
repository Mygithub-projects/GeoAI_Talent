'use client'

import { useLanguage } from '@/i18n/LanguageProvider'

interface AssistantDrawerProps {
  open: boolean
  onClose: () => void
}

function XIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg className="h-5 w-5 text-teal" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  )
}

export function AssistantDrawer({ open, onClose }: AssistantDrawerProps) {
  const { t } = useLanguage()

  return (
    <aside
      aria-label={t.map.assistant}
      className={`
        flex flex-col flex-shrink-0 bg-white border-l border-border
        transition-all duration-200 overflow-hidden
        ${open ? 'w-80' : 'w-0'}
      `}
    >
      {open && (
        <>
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <SparklesIcon />
              <span className="font-display text-sm font-semibold text-slate">
                {t.map.assistant}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label={t.map.closeAssistant}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-slate transition-colors"
            >
              <XIcon />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'var(--gradient-teal-sheen)' }}
            >
              <SparklesIcon />
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-slate">
                {t.map.assistant}
              </p>
              <p className="mt-1.5 max-w-[14rem] text-xs leading-relaxed text-muted">
                {t.map.assistantComingSoon}
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
