'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import type { Translations } from '@/i18n'
import { createUserByAdmin } from './actions'
import { STATEWIDE, PPD_DISTRICTS } from '@/lib/districts'

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

  function reset() {
    setFullName(''); setEmail(''); setRole('user'); setDistrict(''); setError(''); setSuccess('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (role === 'user' && !district) {
      setError(t.admin.districtRequiredError)
      return
    }

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

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t.auth.fullNameLabel}
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
              <Input
                label={t.auth.emailLabel}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
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
                  onChange={e => setDistrict(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue/30"
                >
                  <option value="">— {t.admin.district} —</option>
                  <option value={STATEWIDE}>{t.admin.statewideOption}</option>
                  {PPD_DISTRICTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
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
