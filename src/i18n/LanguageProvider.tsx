'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { type Locale, type Translations, getTranslations, LOCALE_COOKIE, isValidLocale } from './index'

interface LanguageContextValue {
  locale: Locale
  t: Translations
  setLocale: (locale: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode
  initialLocale: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const router = useRouter()

  const setLocale = useCallback((next: Locale) => {
    if (!isValidLocale(next)) return
    setLocaleState(next)
    // Persist in cookie so server reads the correct language on next load
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`
    // Re-render server components (landing/auth heroes, admin pages) in the new language
    router.refresh()
  }, [router])

  return (
    <LanguageContext.Provider value={{ locale, t: getTranslations(locale), setLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return ctx
}
