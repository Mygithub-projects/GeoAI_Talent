// Split-screen auth layout: left navy hero + right white form panel
import Image from 'next/image'
import CursorGrid from '@/components/effects/CursorGrid'
import { cookies } from 'next/headers'
import { getTranslations, isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import { LanguageToggle } from '@/components/LanguageToggle'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE
  const t = getTranslations(locale)

  const chips = [
    t.landing.featureMap,
    t.landing.featureMatching,
    t.auth.chipTravel,
    t.auth.chipBilingual,
  ]

  return (
    <div className="flex min-h-screen">
      {/* ── Left hero panel ──────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-5/12 flex-col justify-between bg-hero-gradient px-10 py-12">
        {/* Background decorative gradient */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              'radial-gradient(ellipse at 30% 60%, #1E63C4 0%, transparent 60%), radial-gradient(ellipse at 70% 20%, #12B5AC 0%, transparent 50%)',
          }}
        />
        <div className="geo-pattern pointer-events-none absolute inset-0" />

        {/* Interactive cursor grid (desktop hero only, decorative).
            Tracks the pointer at window level so the lattice stays alive while
            the cursor is over the form panel — the two grids read as one field
            across the seam. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
          <CursorGrid
            pointerSource="window"
            cellSize={64}
            color="#12B5AC"
            radius={170}
            falloff="smooth"
            holdTime={450}
            fadeDuration={900}
            lineWidth={1}
            maxOpacity={0.9}
            fillOpacity={0.06}
            gridOpacity={0.05}
            clickPulse
            pulseSpeed={560}
          />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Image
            src="/logo_dark.svg"
            alt="GeoAI Talent Agent"
            width={194}
            height={64}
            priority
            className="h-16 w-auto"
          />
        </div>

        {/* Centre copy */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal/20 px-3 py-1 text-xs font-medium text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              {t.auth.heroBadge}
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight text-white">
              {t.auth.heroTitle}
            </h1>
            <p className="text-sm leading-relaxed text-white/70">
              {t.landing.heroDescription}
            </p>
          </div>

          {/* Feature chips */}
          <div className="flex flex-wrap gap-2">
            {chips.map(f => (
              <span
                key={f}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-sm"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative z-10 text-xs text-white/40">
          {t.auth.heroFooter}
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────── */}
      <div className="relative flex flex-1 flex-col bg-surface">
        {/* Same cursor grid, tuned for the light surface: royal blue instead of
            teal and a much lower peak opacity, with matching cell size and
            timings so it stays in step with the hero across the divider. The
            wrapper is pointer-events-none — the form must keep every event —
            which is why the grid listens on window instead of its container. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
          <CursorGrid
            pointerSource="window"
            cellSize={64}
            color="#1E63C4"
            radius={170}
            falloff="smooth"
            holdTime={450}
            fadeDuration={900}
            lineWidth={1}
            maxOpacity={0.3}
            fillOpacity={0.13}
            gridOpacity={0.028}
            clickPulse
            pulseSpeed={560}
          />
        </div>

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-10">
          {/* Mobile logo */}
          <div className="lg:hidden">
            <Image
              src="/logo_horizontal.svg"
              alt="GeoAI Talent Agent"
              width={121}
              height={40}
              className="h-10 w-auto"
            />
          </div>
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </div>

        {/* Form area */}
        <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 lg:px-16">
          <div className="w-full max-w-sm animate-fade-in rounded-card border border-border bg-white p-6 shadow-card sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
