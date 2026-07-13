'use client'

// Guided-tour engine (2026-07-13). Hand-rolled spotlight — no library,
// consistent with the project's zero-new-deps convention. The overlay
// lives at z-[4000]: above the map panels (z-1000) and TransferModal
// (z-3000). Cross-page steps work because this provider is mounted
// once in the (protected) layout's AppShell and survives route
// changes; the current step also mirrors into sessionStorage so a
// hard reload mid-tour resumes where it left off.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/Button'
import { TOUR_STEPS } from './steps'

const DONE_KEY = 'geo-tour-done'   // localStorage — auto-start only once per browser
const STEP_KEY = 'geo-tour-step'   // sessionStorage — resume across reloads mid-tour
const POLL_MS = 150
const POLL_MAX = 53                // ~8s before a missing target is skipped

interface TourContextValue { startTour: () => void }
const TourContext = createContext<TourContextValue>({ startTour: () => {} })
export const useTour = () => useContext(TourContext)

interface SpotRect { top: number; left: number; width: number; height: number }

export function TourProvider({ userRole, children }: { userRole: string; children: React.ReactNode }) {
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()

  const steps = useMemo(
    () => TOUR_STEPS.filter(s => !s.adminOnly || userRole === 'admin'),
    [userRole],
  )

  const [index, setIndex] = useState<number | null>(null)
  const [rect, setRect] = useState<SpotRect | null>(null)
  const [ready, setReady] = useState(false)          // target resolved (or center step)
  const targetRef = useRef<Element | null>(null)

  const finish = useCallback(() => {
    setIndex(null)
    setRect(null)
    setReady(false)
    targetRef.current = null
    try {
      localStorage.setItem(DONE_KEY, '1')
      sessionStorage.removeItem(STEP_KEY)
    } catch { /* storage unavailable — fine */ }
  }, [])

  const activate = useCallback((i: number) => {
    const step = steps[i]
    if (!step) { finish(); return }
    setIndex(i)
    setReady(false)
    setRect(null)
    targetRef.current = null
    try { sessionStorage.setItem(STEP_KEY, String(i)) } catch { /* fine */ }
    if (step.route !== pathname) router.push(step.route)
  }, [steps, pathname, router, finish])

  const next = useCallback(() => {
    if (index == null) return
    if (index >= steps.length - 1) finish()
    else activate(index + 1)
  }, [index, steps.length, activate, finish])

  const prev = useCallback(() => {
    if (index == null || index === 0) return
    activate(index - 1)
  }, [index, activate])

  const startTour = useCallback(() => { activate(0) }, [activate])

  const measure = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [])

  // Resolve the current step's target once the route matches. Poll —
  // force-dynamic pages and map panels render asynchronously; a target
  // that never appears (e.g. empty state replaced the chrome) is
  // skipped rather than stalling the tour.
  useEffect(() => {
    if (index == null) return
    const step = steps[index]
    if (!step || step.route !== pathname) return   // still navigating
    if (!step.target) {
      const raf = requestAnimationFrame(() => { setRect(null); setReady(true) })
      return () => cancelAnimationFrame(raf)
    }
    let tries = 0
    const timer = setInterval(() => {
      const el = document.querySelector(step.target!)
      if (el) {
        clearInterval(timer)
        targetRef.current = el
        el.scrollIntoView({ block: 'center' })
        requestAnimationFrame(() => {
          const r = el.getBoundingClientRect()
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
          setReady(true)
        })
      } else if (++tries > POLL_MAX) {
        clearInterval(timer)
        if (index >= steps.length - 1) finish()
        else activate(index + 1)
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [index, pathname, steps, activate, finish])

  // Keep the spotlight glued to its target on resize/scroll
  useEffect(() => {
    if (index == null) return
    const onMove = () => requestAnimationFrame(measure)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)   // capture — catches the <main> scroller
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [index, measure])

  // Keyboard: Esc ends, arrows navigate
  useEffect(() => {
    if (index == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, finish, next, prev])

  // Resume after a mid-tour reload (sessionStorage survives per tab)
  const resumeTried = useRef(false)
  useEffect(() => {
    if (resumeTried.current) return
    resumeTried.current = true
    let saved: string | null = null
    try { saved = sessionStorage.getItem(STEP_KEY) } catch { /* fine */ }
    if (saved == null) return
    const i = parseInt(saved, 10)
    if (Number.isNaN(i) || i < 0 || i >= steps.length) return
    const timer = setTimeout(() => activate(i), 400)
    return () => clearTimeout(timer)
  }, [steps.length, activate])

  // Auto-start once per browser for first-time users, on the dashboard
  const autoTried = useRef(false)
  useEffect(() => {
    if (autoTried.current || index != null || pathname !== '/dashboard') return
    let done = '1'
    try { done = localStorage.getItem(DONE_KEY) ?? '' } catch { done = '1' }
    if (done) return
    autoTried.current = true
    const timer = setTimeout(() => activate(0), 1200)
    return () => clearTimeout(timer)
  }, [pathname, index, activate])

  // ── Card placement ────────────────────────────────────────────
  const step = index != null ? steps[index] : null
  const showCard = step != null && ready
  const CARD_W = 340
  const CARD_EST_H = 190
  let cardStyle: React.CSSProperties = {
    top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  }
  if (rect && typeof window !== 'undefined') {
    const tallLeftColumn = rect.height > window.innerHeight * 0.5 && rect.left < 120
    if (tallLeftColumn) {
      // e.g. the nav rail / talent filter panel — sit beside it, not on it
      cardStyle = {
        top: Math.max(16, Math.min(rect.top + rect.height / 2 - CARD_EST_H / 2, window.innerHeight - CARD_EST_H - 16)),
        left: Math.min(rect.left + rect.width + 16, window.innerWidth - CARD_W - 16),
      }
    } else {
      const below = rect.top + rect.height + 16
      const fitsBelow = below + CARD_EST_H < window.innerHeight
      const top = fitsBelow ? below : Math.max(16, rect.top - 16 - CARD_EST_H)
      const left = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - CARD_W - 16))
      cardStyle = { top, left }
    }
  }

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      {step != null && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[4000]" role="dialog" aria-modal="true" aria-label={t.tour.button}>
          {/* Backdrop — blocks page interaction. When a target is
              spotlighted, the darkness comes from the spotlight's huge
              box-shadow instead so the target area stays clear. */}
          <div
            className="absolute inset-0 transition-colors duration-200"
            style={{ background: rect ? 'transparent' : 'rgba(14,47,87,0.55)' }}
          />
          {rect && (
            <div
              className="absolute rounded-xl transition-all duration-200"
              style={{
                top: rect.top - 6, left: rect.left - 6,
                width: rect.width + 12, height: rect.height + 12,
                boxShadow: '0 0 0 9999px rgba(14,47,87,0.55), 0 0 0 2px rgba(18,181,172,0.9)',
                pointerEvents: 'none',
              }}
            />
          )}

          {showCard && (
            <div
              className="absolute w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-white p-4 shadow-float animate-fade-up"
              style={cardStyle}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-teal">
                  {index! + 1} / {steps.length}
                </p>
                <button
                  onClick={finish}
                  aria-label={t.tour.skip}
                  className="text-sm leading-none text-muted transition-colors hover:text-slate"
                >✕</button>
              </div>
              <h2 className="mt-1 font-display text-base font-semibold text-ink-navy">{step.getTitle(t)}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate">{step.getBody(t)}</p>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={finish} className="text-xs text-muted transition-colors hover:text-slate">
                  {t.tour.skip}
                </button>
                <div className="flex gap-2">
                  {index! > 0 && (
                    <Button size="sm" variant="secondary" onClick={prev}>{t.tour.back}</Button>
                  )}
                  <Button size="sm" onClick={next}>
                    {index === steps.length - 1 ? t.tour.done : t.tour.next}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </TourContext.Provider>
  )
}
