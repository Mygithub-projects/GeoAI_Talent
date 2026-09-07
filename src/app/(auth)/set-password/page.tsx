'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { AUTH_ERROR, isAuthErrorCode, type AuthErrorCode } from '@/lib/authErrorCodes'
import {
  checkMatch,
  checkPassword,
  validateUpdatePassword,
  type UpdatePasswordField,
} from '@/lib/authValidation'

// Landing page for an admin-issued account invitation. The emailed link points
// HERE (our own origin), never at Supabase — restricted gov/school networks
// cannot reach Supabase directly, and this is the invitee's first ever contact
// with the system, so there is no fallback path if the link is unreachable.
//
// The token is redeemed by POST, not on page load: email security scanners
// prefetch GET links and would burn the single-use token before the human
// clicks. See the note in /api/auth/accept-invite.
function SetPasswordForm() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<UpdatePasswordField, AuthErrorCode>>>({})
  const [formError, setFormError]     = useState<AuthErrorCode | null>(null)

  function reviseField(field: UpdatePasswordField, value: string) {
    if (!fieldErrors[field]) return
    const code = field === 'password' ? checkPassword(value) : checkMatch(value, password)
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

    const problems = validateUpdatePassword({ password, confirm })
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems)
      document.getElementById(`set-${Object.keys(problems)[0]}`)?.focus()
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash: tokenHash, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        const code = isAuthErrorCode(data.code) ? data.code : AUTH_ERROR.UNKNOWN
        if (code === AUTH_ERROR.WEAK_PASSWORD) {
          setFieldErrors({ password: code })
          document.getElementById('set-password')?.focus()
        }
        setFormError(code)
        setLoading(false)
        return
      }

      // verifyOtp set the session cookies server-side — the invitee is now
      // signed in, and their account was activated when the admin created it.
      router.push('/dashboard')
      router.refresh()
    } catch {
      setFormError(AUTH_ERROR.SERVICE_UNAVAILABLE)
      setLoading(false)
    }
  }

  // No token at all — nothing to submit, so don't show a form the user cannot
  // succeed with. "Forgot password?" issues a fresh link and works because the
  // account was created with its email already confirmed.
  if (!tokenHash) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold text-slate">
            {t.auth.setPasswordTitle}
          </h2>
        </div>
        <Alert
          variant="error"
          message={t.auth.setPasswordNoToken}
          action={
            <Link href="/reset-password" className="underline hover:no-underline">
              {t.authErrors.requestNewLink}
            </Link>
          }
        />
        <Link href="/login" className="block text-sm text-royal-blue underline hover:no-underline">
          {t.auth.backToLogin}
        </Link>
      </div>
    )
  }

  // An expired or already-used invitation is the likeliest failure, and the
  // only thing the invitee can do about it is request a fresh link.
  const formAction =
    formError === AUTH_ERROR.SESSION_EXPIRED || formError === AUTH_ERROR.CALLBACK_FAILED ? (
      <Link href="/reset-password" className="underline hover:no-underline">
        {t.authErrors.requestNewLink}
      </Link>
    ) : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-slate">
          {t.auth.setPasswordTitle}
        </h2>
        <p className="text-sm text-muted">{t.auth.setPasswordSubtitle}</p>
      </div>

      {formError && (
        <Alert variant="error" message={t.authErrors[formError]} action={formAction} />
      )}

      {/* noValidate — see login/page.tsx: native validation bubbles render in
          the BROWSER's language, not the app's. */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          id="set-password"
          label={t.auth.newPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={e => {
            setPassword(e.target.value)
            reviseField('password', e.target.value)
            if (fieldErrors.confirm && confirm) reviseField('confirm', confirm)
          }}
          error={fieldErrors.password ? t.authErrors[fieldErrors.password] : undefined}
        />
        <Input
          id="set-confirm"
          label={t.auth.confirmPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={e => { setConfirm(e.target.value); reviseField('confirm', e.target.value) }}
          error={fieldErrors.confirm ? t.authErrors[fieldErrors.confirm] : undefined}
        />
        <Button type="submit" loading={loading} className="w-full mt-2">
          {t.auth.setPassword}
        </Button>
      </form>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  )
}
