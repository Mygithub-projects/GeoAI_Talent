'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import type { Translations } from '@/i18n'
import { createUserByAdmin } from './actions'
import { STATEWIDE, PPD_DISTRICTS } from '@/lib/districts'
import { AUTH_ERROR } from '@/lib/authErrorCodes'
import { checkEmail, checkRequired } from '@/lib/authValidation'

interface Props {
  t: Translations
}

export function AddUserModal({ t }: Props) {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<'admin' | 'user'>('user')
  const [district, setDistrict] = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; district?: string }>({})

  function reset() {
    setFullName(''); setEmail(''); setRole('user'); setDistrict(''); setError(''); setSuccess('')
    setFieldErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Explicit validation: the form carries noValidate, so the browser no
    // longer blocks empty submits — and its bubbles ignored the app's language.
    // Every problem is reported at once, against the field it belongs to.
    const errs: { fullName?: string; email?: string; district?: string } = {}
    if (checkRequired(fullName, AUTH_ERROR.FULL_NAME_REQUIRED)) errs.fullName = t.authErrors.FULL_NAME_REQUIRED
    const emailCode = checkEmail(email)
    if (emailCode) errs.email = t.authErrors[emailCode]
    if (role === 'user' && !district) errs.district = t.admin.districtRequiredError

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      document.getElementById(
        errs.fullName ? 'add-user-fullName' : errs.email ? 'add-user-email' : 'add-user-district'
      )?.focus()
      return
    }

    setFieldErrors({})
    setLoading(true)
    try {
      await createUserByAdmin(email.toLowerCase().trim(), fullName.trim(), role, district || null)
      setSuccess(t.admin.addUserSuccess)
      setFullName(''); setEmail(''); setRole('user'); setDistrict('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
    setLoading(false)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {t.admin.addUser}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}
          role="dialog"
          aria-modal
          aria-labelledby="add-user-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <h3 id="add-user-modal-title" className="font-display text-lg font-semibold text-slate">
                {t.admin.addUserModalTitle}
              </h3>
              <p className="text-xs text-muted">{t.admin.addUserDescription}</p>
            </div>

            {error && <Alert variant="error" message={error} />}
            {success && <Alert variant="success" message={success} />}

            {/* noValidate — native validation bubbles render in the BROWSER's
                language, not the app's. We own these messages instead. */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Input
                id="add-user-fullName"
                label={t.auth.fullNameLabel}
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={e => {
                  setFullName(e.target.value)
                  if (fieldErrors.fullName) setFieldErrors(p => ({ ...p, fullName: undefined }))
                }}
                error={fieldErrors.fullName}
              />
              <Input
                id="add-user-email"
                label={t.auth.emailLabel}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  if (fieldErrors.email && !checkEmail(e.target.value)) {
                    setFieldErrors(p => ({ ...p, email: undefined }))
                  }
                }}
                error={fieldErrors.email}
              />

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate">{t.admin.role}</label>
                <div className="flex gap-2">
                  {(['user', 'admin'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                        role === r
                          ? 'border-royal-blue bg-royal-blue/5 text-royal-blue'
                          : 'border-border text-muted hover:border-slate/40'
                      }`}
                    >
                      {r === 'admin' ? t.admin.roleAdmin.split(' (')[0] : t.admin.roleUser.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* District */}
              <div className="space-y-1.5">
                <label htmlFor="add-user-district" className="text-sm font-medium text-slate">{t.admin.districtLabel}</label>
                <select
                  id="add-user-district"
                  value={district}
                  onChange={e => {
                    setDistrict(e.target.value)
                    if (fieldErrors.district && e.target.value) {
                      setFieldErrors(p => ({ ...p, district: undefined }))
                    }
                  }}
                  aria-invalid={!!fieldErrors.district}
                  aria-describedby={fieldErrors.district ? 'add-user-district-error' : undefined}
                  className={[
                    'h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate',
                    'focus:outline-none focus:ring-2',
                    fieldErrors.district
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-border focus:ring-royal-blue/30',
                  ].join(' ')}
                >
                  <option value="">— {t.admin.district} —</option>
                  <option value={STATEWIDE}>{t.admin.statewideOption}</option>
                  {PPD_DISTRICTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {fieldErrors.district && (
                  <p id="add-user-district-error" className="text-xs text-red-600" role="alert">
                    {fieldErrors.district}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => { setOpen(false); reset() }} className="flex-1">
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={loading} className="flex-1">
                  {t.admin.addUserButton}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
