'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

export default function UpdatePasswordPage() {
  const { t } = useLanguage()
  const router = useRouter()
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
      document.getElementById(`update-${Object.keys(problems)[0]}`)?.focus()
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      // Server-side (mirrors /api/settings/password) — the recovery session
      // cookie authenticates the change, so restricted networks that can't
      // reach Supabase directly still work.
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (!res.ok) {
        const code = isAuthErrorCode(data.code) ? data.code : AUTH_ERROR.UNKNOWN
        if (code === AUTH_ERROR.WEAK_PASSWORD) {
          setFieldErrors({ password: code })
          document.getElementById('update-password')?.focus()
        }
        setFormError(code)
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setFormError(AUTH_ERROR.SERVICE_UNAVAILABLE)
      setLoading(false)
    }
  }

  // An expired or already-used reset link is the most likely failure here, and
  // the only thing the user can do about it is request a fresh one.
  const formAction =
    formError === AUTH_ERROR.SESSION_EXPIRED ? (
      <Link href="/reset-password" className="underline hover:no-underline">
        {t.authErrors.requestNewLink}
      </Link>
    ) : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-slate">
          {t.auth.updatePasswordTitle}
        </h2>
        <p className="text-sm text-muted">{t.auth.updatePasswordSubtitle}</p>
      </div>

      {formError && (
        <Alert variant="error" message={t.authErrors[formError]} action={formAction} />
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          id="update-password"
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
          id="update-confirm"
          label={t.auth.confirmPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={e => { setConfirm(e.target.value); reviseField('confirm', e.target.value) }}
          error={fieldErrors.confirm ? t.authErrors[fieldErrors.confirm] : undefined}
        />
        <Button type="submit" loading={loading} className="w-full mt-2">
          {t.auth.updatePassword}
        </Button>
      </form>
    </div>
  )
}
