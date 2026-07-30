// Stable, machine-readable auth error codes.
//
// The API routes return one of these as `code` alongside the existing
// human-readable English `error` string. The client maps the code to a
// LOCALISED message from the i18n `authErrors` namespace, so error guidance
// follows the user's chosen language instead of being hardcoded English in a
// route handler (BM is the app's default locale).
//
// Never send UI copy from the server — send a code.

export const AUTH_ERROR = {
  // Missing / malformed input (client-side checks + server-side guards)
  MISSING_FIELDS:      'MISSING_FIELDS',
  EMAIL_REQUIRED:      'EMAIL_REQUIRED',
  PASSWORD_REQUIRED:   'PASSWORD_REQUIRED',
  FULL_NAME_REQUIRED:  'FULL_NAME_REQUIRED',
  CONFIRM_REQUIRED:    'CONFIRM_REQUIRED',
  INVALID_EMAIL:       'INVALID_EMAIL',
  PASSWORDS_NO_MATCH:  'PASSWORDS_NO_MATCH',
  WEAK_PASSWORD:       'WEAK_PASSWORD',
  DISTRICT_REQUIRED:   'DISTRICT_REQUIRED',

  // Rejected by the auth provider / our policy
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',
  EMAIL_NOT_ALLOWED:   'EMAIL_NOT_ALLOWED',
  USER_EXISTS:         'USER_EXISTS',

  // Transient / environmental
  RATE_LIMITED:        'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SESSION_EXPIRED:     'SESSION_EXPIRED',
  CALLBACK_FAILED:     'CALLBACK_FAILED',

  UNKNOWN:             'UNKNOWN',
} as const

export type AuthErrorCode = (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR]

const ALL_CODES = new Set<string>(Object.values(AUTH_ERROR))

/** Narrow an untrusted value (e.g. a JSON response field) to a known code. */
export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === 'string' && ALL_CODES.has(value)
}

interface AuthLikeError {
  message?: string | null
  name?: string | null
  status?: number | null
}

// Classify a Supabase auth error into one of our codes. Supabase's wording is
// not a stable API, so this matches loosely and always has a fallback.
export function mapSupabaseAuthError(error: AuthLikeError | null | undefined): AuthErrorCode {
  if (!error) return AUTH_ERROR.UNKNOWN

  const msg    = (error.message ?? '').toLowerCase()
  const status = error.status ?? 0
  const name   = error.name ?? ''

  // Environmental first — a 5xx or a retryable fetch failure tells us nothing
  // about the credentials, so it must never be reported as "wrong password".
  if (status === 429 || /rate limit|too many requests/.test(msg)) return AUTH_ERROR.RATE_LIMITED
  if (status >= 500 || /retryable|fetch failed|network/i.test(name) || /fetch failed/.test(msg)) {
    return AUTH_ERROR.SERVICE_UNAVAILABLE
  }

  if (/invalid login credentials|invalid credentials|invalid email or password/.test(msg)) {
    return AUTH_ERROR.INVALID_CREDENTIALS
  }
  if (/email not confirmed|not confirmed/.test(msg))            return AUTH_ERROR.EMAIL_NOT_CONFIRMED
  if (/already registered|already exists|already been registered/.test(msg)) return AUTH_ERROR.USER_EXISTS
  if (/password/.test(msg) && /short|at least|weak|characters/.test(msg))    return AUTH_ERROR.WEAK_PASSWORD
  if (/unable to validate email|invalid email|email address.*invalid/.test(msg)) return AUTH_ERROR.INVALID_EMAIL
  if (/session|jwt|token/.test(msg) && /expired|missing|invalid/.test(msg))  return AUTH_ERROR.SESSION_EXPIRED

  return AUTH_ERROR.UNKNOWN
}
