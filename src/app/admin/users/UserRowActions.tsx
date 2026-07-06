'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import type { Translations } from '@/i18n'
import { suspendUser, reactivateUser, deleteUserAccount } from './actions'

interface Profile {
  user_id: string
  status: 'pending' | 'active' | 'suspended'
}

interface Props {
  profile: Profile
  t: Translations
  isSelf: boolean
}

export function UserRowActions({ profile, t, isSelf }: Props) {
  const router = useRouter()
  const [busy, setBusy]   = useState<'suspend' | 'reactivate' | 'delete' | null>(null)
  const [error, setError] = useState('')

  async function run(action: 'suspend' | 'reactivate' | 'delete') {
    setError('')
    setBusy(action)
    try {
      if (action === 'suspend') await suspendUser(profile.user_id)
      else if (action === 'reactivate') await reactivateUser(profile.user_id)
      else await deleteUserAccount(profile.user_id)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
    setBusy(null)
  }

  function handleDelete() {
    if (window.confirm(t.admin.deleteConfirm)) run('delete')
  }

  if (isSelf) return <span className="text-xs text-muted">—</span>

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        {profile.status === 'suspended' ? (
          <Button variant="secondary" size="sm" loading={busy === 'reactivate'} onClick={() => run('reactivate')}>
            {t.admin.reactivate}
          </Button>
        ) : profile.status === 'active' ? (
          <Button variant="secondary" size="sm" loading={busy === 'suspend'} onClick={() => run('suspend')}>
            {t.admin.suspend}
          </Button>
        ) : null}
        <Button variant="danger" size="sm" loading={busy === 'delete'} onClick={handleDelete}>
          {t.admin.deleteUser}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
