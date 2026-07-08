import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTranslations, isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import { LanguageToggle } from '@/components/LanguageToggle'

export default async function LandingPage() {
  // If the user is already authenticated and active, redirect to dashboard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('user_id', user.id)
      .single()

    if (profile?.status === 'active') redirect('/dashboard')
    if (profile?.status === 'pending') redirect('/awaiting-approval')
  }

  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE
  const t = getTranslations(locale)

  return (
    <div className="flex min-h-screen flex-col bg-hero-gradient">
      {/* Decorative background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, #1E63C4 0%, transparent 55%), radial-gradient(ellipse at 80% 10%, #12B5AC 0%, transparent 45%)',
        }}
      />
      <div className="geo-pattern pointer-events-none fixed inset-0" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <Image
          src="/logo_dark.svg"
          alt="GeoAI Talent Agent"
          width={180}
          height={44}
          priority
          className="h-9 w-auto"
        />
        <LanguageToggle />
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="space-y-8 max-w-2xl animate-fade-in">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-teal/20 px-4 py-1.5 text-sm font-medium text-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            {t.common.tagline}
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="font-display text-5xl font-bold leading-tight text-white md:text-6xl">
              {t.common.appName}
            </h1>
            <p className="text-lg text-white/70 leading-relaxed">
              {t.landing.heroDescription}
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
            {[
              { icon: '🗺️', label: t.landing.featureMap },
              { icon: '🎯', label: t.landing.featureMatching },
              { icon: '✈️', label: t.landing.featureCost },
              { icon: '🔒', label: t.landing.featureSecure },
            ].map((f, i) => (
              <div
                key={f.label}
                className={`animate-fade-up stagger-${i + 1} rounded-xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm transition-colors hover:border-teal/40 hover:bg-white/15`}
              >
                <span className="text-lg">{f.icon}</span>
                <p className="mt-1 text-xs font-medium text-white/80">{f.label}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-8 text-sm font-semibold text-ink-navy shadow-lg transition-transform hover:scale-105 sm:w-auto"
            >
              {t.auth.signIn}
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/30 bg-white/10 px-8 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:w-auto"
            >
              {t.auth.register}
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} {t.landing.footerText}
      </footer>
    </div>
  )
}
