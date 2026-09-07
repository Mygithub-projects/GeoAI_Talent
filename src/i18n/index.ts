import { en } from './en'
import { bm } from './bm'

export type Locale = 'en' | 'bm'
export type { Translations } from './en'

export const translations = { en, bm } as const

export const LOCALE_COOKIE = 'geo-talent-lang'

// The language a visitor sees when they have no saved preference.
//
// ENGLISH since 2026-09-07 (user decision), previously 'bm'. This governs the
// APP INTERFACE only. It is read by the root layout and six other server
// components, always as `isValidLocale(cookie) ? cookie : DEFAULT_LOCALE`, and
// the client provider is seeded from that server value rather than detecting
// anything itself — which is exactly why there is no hydration mismatch. Keep
// it that way: any client-side language detection would break the invariant.
//
// A saved preference always wins. Anyone who has used the EN/BM toggle holds a
// 365-day `geo-talent-lang` cookie and is unaffected by this constant.
//
// NOT for trainer-facing text. Trainers are not app users and their emails and
// public pages stay Malay by default — see `src/lib/trainerLocale.ts` and the
// pinned 'bm' in `src/app/invitations/responded/page.tsx`. Do not reach for
// DEFAULT_LOCALE in anything a trainer reads.
export const DEFAULT_LOCALE: Locale = 'en'

export function getTranslations(locale: Locale) {
  return translations[locale] ?? translations[DEFAULT_LOCALE]
}

export function isValidLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'bm'
}
