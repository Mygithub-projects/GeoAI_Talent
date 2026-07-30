'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { AUTH_ERROR, isAuthErrorCode, type AuthErrorCode } from '@/lib/authErrorCodes'
import { checkEmail, validateResetPassword, type ResetPasswordField } from '@/lib/authValidation'

export default function ResetPasswordPage() {
  const { t } = useLanguage()
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ResetPasswordField, AuthErrorCode>>>({})
  const [formError, setFormError]     = useState<AuthErrorCode | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const problems = validateResetPassword({ email })
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems)
      document.getElementById('reset-email')?.focus()
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      // Server-side: browsers on restricted gov/school networks cannot reach
      // Supabase directly, so this must not call supabase-js from the client.
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFormError(isAuthErrorCode(data.code) ? data.code : AUTH_ERROR.UNKNOWN)
      } else {
        // Deliberately identical whether or not the address has an account —
        // the route never reveals which, so neither does the UI.
        setSent(true)
      }
    } catch {
      setFormError(AUTH_ERROR.SERVICE_UNAVAILABLE)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-slate">
          {t.auth.resetPasswordTitle}
        </h2>
        <p className="text-sm text-muted">{t.auth.resetPasswordSubtitle}</p>
      </div>

      {formError && <Alert variant="error" message={t.authErrors[formError]} />}
      {sent      && <Alert variant="success" message={t.auth.resetPasswordSent} />}

      {!sent && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            id="reset-email"
            label={t.auth.emailLabel}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              if (fieldErrors.email) {
                const code = checkEmail(e.target.value)
                setFieldErrors(code ? { email: code } : {})
              }
            }}
            placeholder="you@moe.gov.my"
            error={fieldErrors.email ? t.authErrors[fieldErrors.email] : undefined}
          />
          <Button type="submit" loading={loading} className="w-full mt-2">
            {t.auth.sendResetLink}
          </Button>
        </form>
      )}

      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-royal-blue hover:underline">
          {t.auth.backToLogin}
        </Link>
      </p>
    </div>
  )
}
