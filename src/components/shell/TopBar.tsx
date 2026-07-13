'use client'

import { useLanguage } from '@/i18n/LanguageProvider'
import { LanguageToggle } from '@/components/LanguageToggle'
import { NotificationBell } from '@/components/shell/NotificationBell'
import { useTour } from '@/components/tour/TourProvider'

interface TopBarProps {
  userName: string | null
  userRole: string
  onToggleNav: () => void
  onToggleAssistant: () => void
  assistantOpen: boolean
  onSignOut: () => void
}

function HamburgerIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  )
}

function CompassIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.18 8.82l-1.59 4.77-4.77 1.59 1.59-4.77 4.77-1.59z" />
    </svg>
  )
}

export function TopBar({ userName, userRole, onToggleNav, onToggleAssistant, assistantOpen, onSignOut }: TopBarProps) {
  const { t } = useLanguage()
  const { startTour } = useTour()

  const displayName = userName?.split(' ')[0] ?? ''

  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-border/70 bg-white/85 px-4 backdrop-blur-md z-30 shadow-[0_1px_2px_0_rgb(14_47_87_/_0.05)]">
      {/* Nav toggle (mobile / collapsed state) */}
      <button
        onClick={onToggleNav}
        aria-label={t.common.toggleNav}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-slate transition-colors"
      >
        <HamburgerIcon />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-hand controls */}
      <div data-tour="bell" className="flex"><NotificationBell /></div>
      <div data-tour="language" className="flex"><LanguageToggle /></div>

      {/* User name + role badge */}
      <div className="hidden sm:flex items-center gap-2 text-sm">
        <span className="font-medium text-slate">{displayName}</span>
        {userRole === 'admin' && (
          <span className="inline-flex items-center rounded-full bg-royal-blue/10 px-2 py-0.5 text-xs font-semibold text-royal-blue">
            {t.common.adminBadge}
          </span>
        )}
      </div>

      {/* Sign-out */}
      <button
        onClick={onSignOut}
        className="hidden sm:block text-xs text-muted hover:text-slate transition-colors"
      >
        {t.common.signOut}
      </button>

      {/* Guided tour */}
      <button
        onClick={startTour}
        data-tour="tour-button"
        aria-label={t.tour.button}
        title={t.tour.button}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-muted transition-all hover:bg-royal-blue/10 hover:text-royal-blue"
      >
        <CompassIcon />
        <span className="hidden sm:inline">{t.tour.button}</span>
      </button>

      {/* Assistant toggle */}
      <button
        onClick={onToggleAssistant}
        data-tour="assistant"
        aria-label={assistantOpen ? t.map.closeAssistant : t.map.openAssistant}
        title={assistantOpen ? t.map.closeAssistant : t.map.openAssistant}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
          assistantOpen
            ? 'bg-teal text-white shadow-sm'
            : 'bg-surface text-muted hover:bg-teal/10 hover:text-teal-600 border border-border'
        }`}
      >
        <SparklesIcon />
        <span className="hidden sm:inline">{t.map.assistant}</span>
      </button>
    </header>
  )
}
