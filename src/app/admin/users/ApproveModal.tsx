'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import type { Translations } from '@/i18n'
import { approveUser, changeUserRole } from './actions'

// Sentinel stored in profiles.ppd_district for non-admin users who should default
// to a statewide map view (e.g. a state-level officer) without being full admins.
// All active users can already read every district's data (see migration 020) —
// this sentinel only picks the default camera position on login (dashboard/page.tsx),
// it no longer gates row access.
const STATEWIDE = 'STATEWIDE'

// Must match master_trainers.ppd_district exactly (used by fn_district_centroid to
// pick the default map view) — these are the real district values from the ingested
// dataset, not administrative PPD-office groupings.
const PPD_DISTRICTS = [
  'BARAM', 'BAU', 'BELAGA', 'BETONG', 'BINTULU', 'DALAT', 'DARO', 'JULAU',
  'KANOWIT', 'KAPIT', 'KUCHING', 'LAWAS', 'LIMBANG', 'LUBOK ANTU', 'LUNDU',
  'MERADONG', 'MIRI', 'MUKAH', 'PADAWAN', 'SAMARAHAN', 'SARATOK', 'SARIKEI',
  'SELANGAU', 'SERIAN', 'SIBU', 'SIMUNJAN', 'SONG', 'SRI AMAN', 'SUBIS',
  'TATAU SEBAUH', 'TATAU/SEBAUH',
]

interface Profile {
  user_id: string
  full_name: string | null
  email: string
  role: 'admin' | 'user'
  ppd_district: string | null
  status: 'pending' | 'active' | 'suspended'
}

interface Props {
  profile: Profile
  t: Translations
  isEdit?: boolean
}

export function ApproveModal({ profile, t, isEdit = false }: Props) {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [role, setRole]         = useState<'admin' | 'user'>(profile.role)
  const [district, setDistrict] = useState(profile.ppd_district ?? '')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (role === 'user' && !district) {
      setError(t.admin.districtRequiredError)
      return
    }

    setLoading(true)

    try {
      if (!isEdit || profile.status === 'pending') {
        await approveUser(profile.user_id, role, district || null)
      } else {
        await changeUserRole(profile.user_id, role, district || null)
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
    setLoading(false)
  }

  const buttonLabel = isEdit && profile.status !== 'pending'
    ? t.admin.changeRole
    : t.admin.approve

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          role="dialog"
          aria-modal
          aria-labelledby="approve-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <h3 id="approve-modal-title" className="font-display text-lg font-semibold text-slate">
                {t.admin.approveModal}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {profile.full_name ?? profile.email}
              </p>
              <p className="text-xs text-muted">{t.admin.approveDescription}</p>
            </div>

            {error && <Alert variant="error" message={error} />}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <label className="text-sm font-medium text-slate">{t.admin.districtLabel}</label>
                <select
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
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="flex-1">
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={loading} className="flex-1">
                  {t.common.confirm}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
