'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/i18n/LanguageProvider'
import type { Translations } from '@/i18n/en'

interface AssistantDrawerProps {
  open: boolean
  onClose: () => void
}

interface ChatBubble {
  role: 'user' | 'assistant'
  content: string
  generalKnowledge?: boolean
}

type ChipKey = keyof Pick<
  Translations['lexi'],
  | 'chipFindTrainers'
  | 'chipAvailability'
  | 'chipHistory'
  | 'chipOpenCalendar'
  | 'chipOpenEngagements'
  | 'chipHowCost'
  | 'chipWhatIsModeB'
>

const STARTER_CHIPS: ChipKey[] = [
  'chipFindTrainers',
  'chipAvailability',
  'chipHowCost',
  'chipWhatIsModeB',
  'chipOpenCalendar',
]

function XIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SparklesIcon({ className = 'h-5 w-5 text-teal' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  )
}

function GlobeBadge({ label }: { label: string }) {
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3 7.5 7.03 7.5 12s2.015 9 4.5 9zM3.6 9h16.8M3.6 15h16.8" />
      </svg>
      {label}
    </span>
  )
}

export function AssistantDrawer({ open, onClose }: AssistantDrawerProps) {
  const { t, locale } = useLanguage()
  const router = useRouter()

  const [messages, setMessages]   = useState<ChatBubble[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [suggestions, setSuggestions] = useState<ChipKey[]>(STARTER_CHIPS)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, historyLoaded])

  // Replay the saved conversation the first time the drawer opens —
  // Lexi's memory is server-side (assistant_messages), so the chat
  // survives page reloads and sign-ins.
  useEffect(() => {
    if (!open || historyLoaded) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/assistant/history')
        if (res.ok) {
          const data = await res.json() as {
            messages?: { role: 'user' | 'assistant'; content: string; generalKnowledge?: boolean }[]
          }
          if (!cancelled && (data.messages?.length ?? 0) > 0) {
            setMessages(data.messages!.map(m => ({
              role: m.role,
              content: m.content,
              generalKnowledge: m.generalKnowledge,
            })))
          }
        }
      } catch { /* start a fresh conversation */ }
      if (!cancelled) setHistoryLoaded(true)
    })()
    return () => { cancelled = true }
  }, [open, historyLoaded])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const nextMessages: ChatBubble[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      // Only the new message is sent — the server replays history from
      // its own store (Lexi's memory), so the context can't be spoofed
      // and persists across sessions.
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, message: trimmed }),
      })

      if (!res.ok) throw new Error(`assistant ${res.status}`)
      const data = await res.json() as {
        reply: string
        actions?: { type: 'navigate'; path: string }[]
        generalKnowledge?: boolean
        suggestionKeys?: string[]
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || '…',
        generalKnowledge: data.generalKnowledge,
      }])

      const keys = (data.suggestionKeys ?? []).filter((k): k is ChipKey =>
        STARTER_CHIPS.includes(k as ChipKey) ||
        ['chipHistory', 'chipOpenEngagements', 'chipOpenCalendar', 'chipAvailability', 'chipFindTrainers', 'chipHowCost'].includes(k)
      )
      if (keys.length > 0) setSuggestions(keys)

      for (const action of data.actions ?? []) {
        if (action.type === 'navigate' && action.path.startsWith('/')) {
          router.push(action.path)
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t.lexi.errorMessage }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, loading, locale, router, t.lexi.errorMessage])

  const fillFromChip = useCallback((key: ChipKey) => {
    const text = t.lexi[key]
    // Navigation chips are unambiguous — send immediately; template chips
    // (with [placeholders]) fill the input for the user to edit first.
    if (text.includes('[')) {
      setInput(text)
      inputRef.current?.focus()
    } else {
      void send(text)
    }
  }, [t.lexi, send])

  const clearChat = useCallback(() => {
    setMessages([])
    setSuggestions(STARTER_CHIPS)
    setInput('')
    // Also wipe the server-side transcript + memory summary.
    void fetch('/api/assistant/history', { method: 'DELETE' }).catch(() => {})
  }, [])

  return (
    <aside
      aria-label={t.lexi.title}
      className={`
        flex flex-col flex-shrink-0 bg-white border-l border-border
        transition-all duration-200 overflow-hidden
        ${open ? 'w-96' : 'w-0'}
      `}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <SparklesIcon />
              <span className="font-display text-sm font-semibold text-slate">{t.lexi.title}</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  title={t.lexi.clearChat}
                  aria-label={t.lexi.clearChat}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-slate transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                aria-label={t.map.closeAssistant}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-slate transition-colors"
              >
                <XIcon />
              </button>
            </div>
          </div>

          {/* Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {!historyLoaded && messages.length === 0 ? null : messages.length === 0 ? (
              <div className="flex flex-col gap-4">
                <div className="flex gap-2.5">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--gradient-teal-sheen)' }}
                  >
                    <SparklesIcon className="h-4 w-4 text-teal" />
                  </div>
                  <p className="rounded-2xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-slate">
                    {t.lexi.greeting}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1.5 pl-10">
                  {STARTER_CHIPS.map(key => (
                    <button
                      key={key}
                      onClick={() => fillFromChip(key)}
                      className="rounded-full border border-border bg-white px-3 py-1.5 text-left text-xs text-royal-blue transition-colors hover:border-royal-blue/50 hover:bg-blue-50"
                    >
                      {t.lexi[key]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${m.role === 'user' ? 'text-right' : ''}`}>
                      <div
                        className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed ${
                          m.role === 'user'
                            ? 'rounded-br-sm bg-royal-blue text-white'
                            : 'rounded-tl-sm bg-surface text-slate'
                        }`}
                      >
                        {m.content}
                      </div>
                      {m.generalKnowledge && <GlobeBadge label={t.lexi.generalKnowledgeLabel} />}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <svg className="h-3.5 w-3.5 animate-spin text-teal" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t.lexi.thinking}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Follow-up suggestions */}
          {messages.length > 0 && !loading && suggestions.length > 0 && (
            <div className="flex flex-shrink-0 flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
              {suggestions.slice(0, 3).map(key => (
                <button
                  key={key}
                  onClick={() => fillFromChip(key)}
                  className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-royal-blue transition-colors hover:border-royal-blue/50 hover:bg-blue-50"
                >
                  {t.lexi[key]}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={e => { e.preventDefault(); void send(input) }}
            className="flex flex-shrink-0 items-center gap-2 border-t border-border p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={t.lexi.inputPlaceholder}
              disabled={loading}
              className="h-9 flex-1 rounded-full border border-border bg-surface px-3.5 text-[13px] text-slate placeholder:text-muted focus:border-royal-blue focus:outline-none focus:ring-2 focus:ring-royal-blue/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label={t.lexi.send}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cta-gradient text-white shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </form>
        </>
      )}
    </aside>
  )
}
