// Supabase auth errors don't always carry a human-readable `.message`.
// A server-side failure during sign-up/sign-in (e.g. the confirmation
// email failing to send) surfaces as an AuthRetryableFetchError whose
// message serialises to the bare string "{}" — which then leaked to the
// UI. This maps those unhelpful/system errors to a clear, actionable
// message so the user never sees "{}" (genuine, specific messages such
// as "Invalid login credentials" or "Unable to validate email address"
// are passed through unchanged).

interface AuthLikeError {
  message?: string | null
  name?: string | null
  status?: number | null
}

export function friendlyAuthError(error: AuthLikeError | null | undefined, fallback: string): string {
  const msg = (error?.message ?? '').trim()
  const unhelpful =
    msg === '' || msg === '{}' || msg === '[object Object]' || msg === 'null' || msg === 'undefined'
  const isSystem = (error?.status ?? 0) >= 500 || /retryable|fetch/i.test(error?.name ?? '')
  return unhelpful || isSystem ? fallback : msg
}
