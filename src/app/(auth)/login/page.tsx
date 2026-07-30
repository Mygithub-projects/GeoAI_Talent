'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import LoginCardGlow from '@/components/effects/LoginCardGlow'
import { AUTH_ERROR, isAuthErrorCode, type AuthErrorCode } from '@/lib/authErrorCodes'
import { checkEmail, checkRequired, validateLogin, type LoginField } from '@/lib/authValidation'

export default function LoginPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  // Per-field problems (shown inline, next to the input) vs. one form-level
  // problem (shown in the alert above the form).
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, AuthErrorCode>>>({})
  const [formError, setFormError]     = useState<AuthErrorCode | null>(
    // An expired/invalid magic or reset link lands here via /auth/callback.
    searchParams.get('error') === 'auth_callback_error' ? AUTH_ERROR.CALLBACK_FAILED : null
  )

  // Once a field has been flagged, re-check it as the user types so the error
  // clears the moment it's fixed — never wait for another submit to say "ok".
  function reviseField(field: LoginField, value: string) {
    if (!fieldErrors[field]) return
    const code =
      field === 'email' ? checkEmail(value) : checkRequired(value, AUTH_ERROR.PASSWORD_REQUIRED)
    setFieldErrors(prev => {
      const next = { ...prev }
      if (code) next[field] = code
      else delete next[field]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    // Validate everything at once, so all problems surface on one submit.
    const problems = validateLogin({ email, password })
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems)
      setFormError(AUTH_ERROR.MISSING_FIELDS)
      document.getElementById(`login-${Object.keys(problems)[0]}`)?.focus()
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      // Auth is proxied through Next.js so the browser never needs a direct
      // connection to Supabase (works on restricted/firewalled networks).
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFormError(isAuthErrorCode(data.code) ? data.code : AUTH_ERROR.UNKNOWN)
        setLoading(false)
        return
      }

      if (data.profileStatus === 'pending') {
        router.push('/awaiting-approval')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    } catch {
      // fetch itself failed — the network, not the credentials.
      setFormError(AUTH_ERROR.SERVICE_UNAVAILABLE)
      setLoading(false)
    }
  }

  // Failures the user can act on get a next step inside the alert.
  const ACTION_LABEL: Partial<Record<AuthErrorCode, string>> = {
    [AUTH_ERROR.INVALID_CREDENTIALS]: t.auth.forgotPassword,
    [AUTH_ERROR.CALLBACK_FAILED]:     t.authErrors.requestNewLink,
    [AUTH_ERROR.SESSION_EXPIRED]:     t.authErrors.requestNewLink,
  }
  const actionLabel = formError ? ACTION_LABEL[formError] : undefined
  const formAction = actionLabel ? (
    <Link href="/reset-password" className="underline hover:no-underline">
      {actionLabel}
    </Link>
  ) : undefined

  return (
    <div className="space-y-6">
      <LoginCardGlow />
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-slate">
          {t.auth.loginTitle}
        </h2>
        <p className="text-sm text-muted">{t.auth.loginSubtitle}</p>
      </div>

      {formError && (
        <Alert
          variant="error"
          message={
            formError === AUTH_ERROR.MISSING_FIELDS
              ? t.authErrors.fixHighlighted
              : t.authErrors[formError]
          }
          action={formAction}
        />
      )}

      {/* noValidate: the browser's own validation bubbles render in the
          BROWSER's language, not the app's — we own these messages so they
          follow the selected locale. The required/type attributes stay for
          semantics and assistive tech. */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          id="login-email"
          label={t.auth.emailLabel}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => { setEmail(e.target.value); reviseField('email', e.target.value) }}
          placeholder="you@moe.gov.my"
          error={fieldErrors.email ? t.authErrors[fieldErrors.email] : undefined}
        />
        <div className="space-y-1">
          <Input
            id="login-password"
            label={t.auth.passwordLabel}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => { setPassword(e.target.value); reviseField('password', e.target.value) }}
            error={fieldErrors.password ? t.authErrors[fieldErrors.password] : undefined}
          />
          <div className="text-right">
            <Link
              href="/reset-password"
              className="text-xs text-royal-blue hover:underline"
            >
              {t.auth.forgotPassword}
            </Link>
          </div>
        </div>

        <Button type="submit" loading={loading} className="spec-edge w-full mt-2">
          {t.auth.signIn}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {t.auth.noAccount}{' '}
        <Link href="/register" className="font-medium text-royal-blue hover:underline">
          {t.auth.register}
        </Link>
      </p>
    </div>
  )
}
