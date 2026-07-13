'use client'

import { useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'

interface Props {
  fullName: string
  email:    string
  role:     string
  district: string | null
}

export function SettingsClient({ fullName, email, role, district }: Props) {
  const { t } = useLanguage()
  const s = t.settings

  // ── Display name ──────────────────────────────────────────────
  const [name, setName]           = useState(fullName)
  const [savedName, setSavedName] = useState(fullName)
  const [nameBusy, setNameBusy]   = useState(false)
  const [nameMsg, setNameMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setNameBusy(true)
    setNameMsg(null)
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? s.genericError)
      setSavedName(body.full_name)
      setName(body.full_name)
      setNameMsg({ ok: true, text: s.nameSaved })
    } catch (err) {
      setNameMsg({ ok: false, text: (err as Error).message })
    } finally {
      setNameBusy(false)
    }
  }

  // ── Password ──────────────────────────────────────────────────
  const [pw, setPw]           = useState('')
  const [pw2, setPw2]         = useState('')
  const [pwBusy, setPwBusy]   = useState(false)
  const [pwMsg, setPwMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (pw.length < 8) { setPwMsg({ ok: false, text: s.passwordTooShort }); return }
    if (pw !== pw2)    { setPwMsg({ ok: false, text: s.passwordsNoMatch }); return }
    setPwBusy(true)
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? s.genericError)
      setPw('')
      setPw2('')
      setPwMsg({ ok: true, text: s.passwordSaved })
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message })
    } finally {
      setPwBusy(false)
    }
  }

  const cardCls  = 'rounded-xl border border-border bg-white p-5 shadow-card'
  const cardHdr  = 'text-[11px] font-bold uppercase tracking-wide text-muted'
  const rowLabel = 'w-32 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted pt-0.5'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-slate">{s.title}</h1>
        <p className="mt-1 text-sm text-muted">{s.subtitle}</p>
      </div>

      <div className="mt-6 space-y-5">

        {/* ── My account (read-only) ─────────────────────────── */}
        <section className={`${cardCls} animate-fade-up`}>
          <h2 className={cardHdr}>{s.profileTitle}</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex gap-3">
              <dt className={rowLabel}>{s.emailLabel}</dt>
              <dd className="font-medium text-slate">{email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className={rowLabel}>{s.roleLabel}</dt>
              <dd>
                <Badge variant={role === 'admin' ? 'blue' : 'muted'}>
                  {role === 'admin' ? s.roleAdmin : s.roleUser}
                </Badge>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className={rowLabel}>{s.districtLabel}</dt>
              <dd className="text-slate">
                {district && district !== 'STATEWIDE' ? district : s.statewide}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Display name ───────────────────────────────────── */}
        <section className={`${cardCls} animate-fade-up`}>
          <h2 className={cardHdr}>{s.nameTitle}</h2>
          <form onSubmit={saveName} className="mt-3 space-y-3">
            <Input
              label={s.nameLabel}
              hint={s.nameHint}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
              required
            />
            {nameMsg && <Alert variant={nameMsg.ok ? 'success' : 'error'} message={nameMsg.text} />}
            <Button type="submit" loading={nameBusy} disabled={name.trim().length === 0 || name.trim() === savedName}>
              {nameBusy ? s.saving : s.save}
            </Button>
          </form>
        </section>

        {/* ── Change password ────────────────────────────────── */}
        <section className={`${cardCls} animate-fade-up`}>
          <h2 className={cardHdr}>{s.passwordTitle}</h2>
          <form onSubmit={savePassword} className="mt-3 space-y-3">
            <Input
              type="password"
              label={s.newPassword}
              hint={s.passwordHint}
              value={pw}
              onChange={e => setPw(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Input
              type="password"
              label={s.confirmPassword}
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              autoComplete="new-password"
              required
            />
            {pwMsg && <Alert variant={pwMsg.ok ? 'success' : 'error'} message={pwMsg.text} />}
            <Button type="submit" loading={pwBusy} disabled={pw.length === 0 || pw2.length === 0}>
              {pwBusy ? s.saving : s.save}
            </Button>
          </form>
        </section>

        {/* ── Preferences ────────────────────────────────────── */}
        <section className={`${cardCls} animate-fade-up`}>
          <h2 className={cardHdr}>{s.prefsTitle}</h2>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate">{s.languageLabel}</p>
              <p className="mt-0.5 text-xs text-muted">{s.languageNote}</p>
            </div>
            <LanguageToggle />
          </div>
        </section>

      </div>
    </div>
  )
}
