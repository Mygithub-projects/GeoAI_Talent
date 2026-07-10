'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'

interface NotificationRow {
  notif_id:   string
  type:       string
  message_en: string | null
  message_bm: string | null
  read_at:    string | null
  created_at: string
}

function BellIcon() {
  return (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}

export function NotificationBell() {
  const { t, locale } = useLanguage()
  const [open, setOpen]       = useState(false)
  const [rows, setRows]       = useState<NotificationRow[]>([])
  const [unread, setUnread]   = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json() as { notifications: NotificationRow[]; unread: number }
      setRows(data.notifications)
      setUnread(data.unread)
    } catch { /* silent — bell is best-effort */ }
  }, [])

  // Fetch on mount, then poll every 60s and on window focus — the TopBar
  // lives in the persistent layout and never remounts on navigation, so
  // without this a trainer response would only surface after a full reload.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-mount, not derived state
    void refresh()
    const interval = setInterval(() => { void refresh() }, 60_000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggle = useCallback(async () => {
    const next = !open
    setOpen(next)
    if (next) {
      await refresh()
      // Mark read AFTER rendering the list — unread rows stay highlighted
      // for this viewing, the badge clears for the next one.
      if (unread > 0) {
        void fetch('/api/notifications', { method: 'POST' }).then(() => setUnread(0))
      }
    }
  }, [open, refresh, unread])

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'bm' ? 'ms-MY' : 'en-MY', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    })

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => void toggle()}
        aria-label={t.notif.openAria}
        title={t.notif.title}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-slate transition-colors"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-card border border-border bg-white shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-display text-xs font-semibold text-slate">{t.notif.title}</span>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">{t.notif.empty}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {rows.map(n => {
                const message = (locale === 'bm' ? n.message_bm : n.message_en) ?? n.message_en ?? ''
                const isUnread = !n.read_at
                return (
                  <li
                    key={n.notif_id}
                    className={`border-b border-border/60 px-4 py-2.5 last:border-b-0 ${isUnread ? 'bg-blue-50/60' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          n.type === 'trainer_accepted' ? 'bg-teal' : n.type === 'trainer_declined' ? 'bg-red-500' : 'bg-royal-blue'
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-xs leading-relaxed text-slate">{message}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted">{fmtTime(n.created_at)}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
