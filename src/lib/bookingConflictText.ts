import type { Translations } from '@/i18n/en'

// Client-safe display helpers for the migration 031 booking rules.

interface ConflictLike {
  trainer_id?:    string
  training_title: string | null
  start_date:     string
  end_date:       string
}

export function conflictText(t: Translations, c: ConflictLike): string {
  const dates = c.start_date === c.end_date ? c.start_date : `${c.start_date} – ${c.end_date}`
  return t.booking.conflict
    .replace('{title}', c.training_title ?? '—')
    .replace('{dates}', dates)
}

// Turns an API error body into a translated message: the booking clash
// (code TRAINER_DATE_CONFLICT) gets the localized text, anything else
// keeps the server's message.
export function apiErrorText(
  t: Translations,
  body: { error?: string; code?: string; conflict?: ConflictLike } | null | undefined,
  fallback: string,
): string {
  if (body?.code === 'TRAINER_DATE_CONFLICT') {
    return body.conflict ? conflictText(t, body.conflict) : t.booking.conflictGeneric
  }
  return body?.error ?? fallback
}
