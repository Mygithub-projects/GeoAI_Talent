'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { STATEWIDE, PPD_DISTRICTS } from '@/lib/districts'

export default function RegisterPage() {
  const { t } = useLanguage()
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [district, setDistrict] = useState('')
  const [status, setStatus]     = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)

    // Client-side validation
    if (password !== confirm) {
      setStatus({ type: 'error', message: t.auth.passwordsNoMatch })
      return
    }
    if (password.length < 8) {
      setStatus({ type: 'error', message: t.auth.passwordTooShort })
      return
    }
    if (!district) {
      setStatus({ type: 'error', message: t.auth.districtRequiredError })
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, ppd_district: district }),
    })

    const data = await res.json()

    if (!res.ok || data.error) {
      setStatus({ type: 'error', message: data.error ?? t.common.error })
    } else {
      setStatus({ type: 'success', message: t.auth.checkEmail })
      // Clear form
      setFullName(''); setEmail(''); setPassword(''); setConfirm(''); setDistrict('')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-slate">
          {t.auth.registerTitle}
        </h2>
        <p className="text-sm text-muted">{t.auth.registerSubtitle}</p>
      </div>

      {status && (
        <Alert variant={status.type === 'error' ? 'error' : 'success'} message={status.message} />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t.auth.fullNameLabel}
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder={t.auth.fullNameLabel}
        />
        <Input
          label={t.auth.emailLabel}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@moe.gov.my"
          hint={t.auth.domainHint}
        />
        <Input
          label={t.auth.passwordLabel}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <Input
          label={t.auth.confirmPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />

        <div className="space-y-1.5">
          <label htmlFor="register-district" className="text-sm font-medium text-slate">{t.auth.districtLabel}</label>
          <select
            id="register-district"
            required
            value={district}
            onChange={e => setDistrict(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue/30"
          >
            <option value="">{t.auth.districtPlaceholder}</option>
            <option value={STATEWIDE}>{t.auth.statewideOption}</option>
            {PPD_DISTRICTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="text-xs text-muted">{t.auth.districtHint}</p>
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
