'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { STATEWIDE, PPD_DISTRICTS } from '@/lib/districts'
import { AUTH_ERROR, isAuthErrorCode, type AuthErrorCode } from '@/lib/authErrorCodes'
import {
  checkEmail,
  checkMatch,
  checkPassword,
  checkRequired,
  validateRegister,
  type RegisterField,
} from '@/lib/authValidation'

export default function RegisterPage() {
  const { t } = useLanguage()
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [district, setDistrict] = useState('')
  const [loading, setLoading]   = useState(false)

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, AuthErrorCode>>>({})
  const [formError, setFormError]     = useState<AuthErrorCode | null>(null)
  const [success, setSuccess]         = useState(false)

  // Re-check a single already-flagged field as the user types, so its error
  // clears as soon as it's fixed.
  function reviseField(field: RegisterField, value: string) {
    if (!fieldErrors[field]) return
    let code: AuthErrorCode | null = null
    switch (field) {
      case 'fullName': code = checkRequired(value, AUTH_ERROR.FULL_NAME_REQUIRED); break
      case 'email':    code = checkEmail(value); break
      case 'password': code = checkPassword(value); break
      case 'confirm':  code = checkMatch(value, password); break
      case 'district': code = checkRequired(value, AUTH_ERROR.DISTRICT_REQUIRED); break
    }
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
    setSuccess(false)

    // Every problem at once — a user with three mistakes shouldn't have to
    // submit three times to discover them.
    const problems = validateRegister({ fullName, email, password, confirm, district })
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems)
      setFormError(AUTH_ERROR.MISSING_FIELDS)
      document.getElementById(`register-${Object.keys(problems)[0]}`)?.focus()
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, ppd_district: district }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        const code = isAuthErrorCode(data.code) ? data.code : AUTH_ERROR.UNKNOWN
        // Server-side rejections that belong to one specific field are shown
        // against that field, not only in the banner.
        if (code === AUTH_ERROR.EMAIL_NOT_ALLOWED || code === AUTH_ERROR.USER_EXISTS ||
            code === AUTH_ERROR.INVALID_EMAIL) {
          setFieldErrors({ email: code })
          document.getElementById('register-email')?.focus()
        } else if (code === AUTH_ERROR.WEAK_PASSWORD) {
          setFieldErrors({ password: code })
          document.getElementById('register-password')?.focus()
        } else if (code === AUTH_ERROR.DISTRICT_REQUIRED) {
          setFieldErrors({ district: code })
        }
        setFormError(code)
      } else {
        setSuccess(true)
        setFullName(''); setEmail(''); setPassword(''); setConfirm(''); setDistrict('')
      }
    } catch {
      setFormError(AUTH_ERROR.SERVICE_UNAVAILABLE)
    }
    setLoading(false)
  }

  const formAction =
    formError === AUTH_ERROR.USER_EXISTS ? (
      <Link href="/login" className="underline hover:no-underline">{t.auth.signIn}</Link>
    ) : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-slate">
          {t.auth.registerTitle}
        </h2>
        <p className="text-sm text-muted">{t.auth.registerSubtitle}</p>
      </div>

      {success && <Alert variant="success" message={t.auth.checkEmail} />}
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

      {/* noValidate — see the note in login/page.tsx: native validation
          bubbles ignore the app's language setting. */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          id="register-fullName"
          label={t.auth.fullNameLabel}
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={e => { setFullName(e.target.value); reviseField('fullName', e.target.value) }}
          placeholder={t.auth.fullNameLabel}
          error={fieldErrors.fullName ? t.authErrors[fieldErrors.fullName] : undefined}
        />
        <Input
          id="register-email"
          label={t.auth.emailLabel}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => { setEmail(e.target.value); reviseField('email', e.target.value) }}
          placeholder="you@moe.gov.my"
          hint={t.auth.domainHint}
          error={fieldErrors.email ? t.authErrors[fieldErrors.email] : undefined}
        />
        <Input
          id="register-password"
          label={t.auth.passwordLabel}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={e => {
            setPassword(e.target.value)
            reviseField('password', e.target.value)
            // The confirm field's validity depends on this one.
            if (fieldErrors.confirm && confirm) reviseField('confirm', confirm)
          }}
          error={fieldErrors.password ? t.authErrors[fieldErrors.password] : undefined}
        />
        <Input
          id="register-confirm"
          label={t.auth.confirmPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={e => { setConfirm(e.target.value); reviseField('confirm', e.target.value) }}
          error={fieldErrors.confirm ? t.authErrors[fieldErrors.confirm] : undefined}
        />

        <div className="space-y-1.5">
          <label htmlFor="register-district" className="text-sm font-medium text-slate">{t.auth.districtLabel}</label>
          <select
            id="register-district"
            required
            value={district}
            onChange={e => { setDistrict(e.target.value); reviseField('district', e.target.value) }}
            aria-invalid={!!fieldErrors.district}
            aria-describedby={fieldErrors.district ? 'register-district-error' : 'register-district-hint'}
            className={[
              'h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate',
              'focus:outline-none focus:ring-2',
              fieldErrors.district
                ? 'border-red-400 focus:ring-red-400'
                : 'border-border focus:ring-royal-blue/30',
            ].join(' ')}
          >
            <option value="">{t.auth.districtPlaceholder}</option>
            <option value={STATEWIDE}>{t.auth.statewideOption}</option>
            {PPD_DISTRICTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {fieldErrors.district ? (
            <p id="register-district-error" className="text-xs text-red-600" role="alert">
              {t.authErrors[fieldErrors.district]}
            </p>
          ) : (
            <p id="register-district-hint" className="text-xs text-muted">{t.auth.districtHint}</p>
          )}
        </div>

        <Button type="submit" loading={loading} className="w-full mt-2">
          {t.auth.register}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {t.auth.haveAccount}{' '}
        <Link href="/login" className="font-medium text-royal-blue hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </div>
  )
}
