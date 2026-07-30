'use client'

import { useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { AUTH_ERROR } from '@/lib/authErrorCodes'
import { checkMatch, checkPassword, checkRequired } from '@/lib/authValidation'

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
  const [nameErr, setNameErr]     = useState('')

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setNameMsg(null)

    // Explicit check because the form carries noValidate (see the note on the
    // form element) — the browser no longer blocks an empty submit for us.
    if (checkRequired(name, AUTH_ERROR.FULL_NAME_REQUIRED)) {
      setNameErr(t.authErrors.FULL_NAME_REQUIRED)
      return
    }
    setNameErr('')
    setNameBusy(true)
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
  const [pwErr, setPwErr]     = useState<{ pw?: string; pw2?: string }>({})

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)

    // Both problems reported at once, and attached to the field they belong to
    // rather than only to the banner.
    const errs: { pw?: string; pw2?: string } = {}
    if (checkPassword(pw))       errs.pw  = s.passwordTooShort
    if (checkMatch(pw2, pw))     errs.pw2 = s.passwordsNoMatch
    if (errs.pw || errs.pw2) {
      setPwErr(errs)
      document.getElementById(errs.pw ? 'settings-password' : 'settings-confirm')?.focus()
      return
    }
    setPwErr({})
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
        <section data-tour="set-name" className={`${cardCls} animate-fade-up`}>
          <h2 className={cardHdr}>{s.nameTitle}</h2>
          {/* noValidate — the browser's native validation bubbles render in the
              BROWSER's language, not the app's, which breaks the single-active-
              language rule. We own these messages instead. */}
          <form onSubmit={saveName} className="mt-3 space-y-3" noValidate>
            <Input
              id="settings-name"
              label={s.nameLabel}
              hint={s.nameHint}
              value={name}
              onChange={e => { setName(e.target.value); if (nameErr) setNameErr('') }}
              maxLength={120}
              required
              error={nameErr || undefined}
            />
            {nameMsg && <Alert variant={nameMsg.ok ? 'success' : 'error'} message={nameMsg.text} />}
            <Button type="submit" loading={nameBusy} disabled={name.trim().length === 0 || name.trim() === savedName}>
              {nameBusy ? s.saving : s.save}
            </Button>
          </form>
        </section>

        {/* ── Change password ────────────────────────────────── */}
        <section data-tour="set-password" className={`${cardCls} animate-fade-up`}>
          <h2 className={cardHdr}>{s.passwordTitle}</h2>
          <form onSubmit={savePassword} className="mt-3 space-y-3" noValidate>
            <Input
              id="settings-password"
              type="password"
              label={s.newPassword}
              hint={s.passwordHint}
              value={pw}
              onChange={e => {
                setPw(e.target.value)
                // Re-check live once flagged; the confirm field's validity
                // depends on this one, so clear it too when it now matches.
                if (pwErr.pw && !checkPassword(e.target.value)) setPwErr(p => ({ ...p, pw: undefined }))
                if (pwErr.pw2 && !checkMatch(pw2, e.target.value)) setPwErr(p => ({ ...p, pw2: undefined }))
              }}
              autoComplete="new-password"
              required
              error={pwErr.pw}
            />
            <Input
              id="settings-confirm"
              type="password"
              label={s.confirmPassword}
              value={pw2}
              onChange={e => {
                setPw2(e.target.value)
                if (pwErr.pw2 && !checkMatch(e.target.value, pw)) setPwErr(p => ({ ...p, pw2: undefined }))
              }}
              autoComplete="new-password"
              required
              error={pwErr.pw2}
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
