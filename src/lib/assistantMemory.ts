import type { SupabaseClient } from '@supabase/supabase-js'
import { llm } from '@/lib/llm'

// ── Lexi conversation memory ─────────────────────────────────────
// Backed by migration 023 (assistant_messages + assistant_memory).
// Two layers:
//   1. Recent window — the last RECENT_WINDOW turns are replayed
//      verbatim as LLM context on every request.
//   2. Rolling summary — once enough older turns have scrolled out
//      of that window, they are condensed by one llm() call into a
//      compact per-user summary (assistant_memory.summary) that is
//      injected into the system prompt, so Lexi keeps continuity far
//      beyond the raw context window.
// Every function here is best-effort: if the tables do not exist yet
// (migration 023 not run) or a query fails, Lexi still answers — she
// just falls back to single-session behaviour.

export const RECENT_WINDOW = 12   // turns replayed verbatim per request
const CONDENSE_MIN         = 10   // condense once ≥ this many older turns are unsummarized
const FETCH_CAP            = 80   // safety cap when loading unsummarized turns

export interface StoredTurn {
  role: 'user' | 'assistant'
  content: string
  general_knowledge: boolean
  created_at: string
}

export interface MemoryContext {
  summary: string
  recent: StoredTurn[]
}

function warnOnce(err: unknown) {
  console.warn('[assistant] memory unavailable (has migration 023 been run?):',
    err instanceof Error ? err.message : err)
}

// Load the caller's memory summary + the recent turns to replay as
// context. Also performs the condensation pass when it is due, so the
// summary used this turn is already up to date.
export async function loadMemoryContext(
  admin: SupabaseClient,
  userId: string,
): Promise<MemoryContext> {
  try {
    const { data: mem, error: memErr } = await admin
      .from('assistant_memory')
      .select('summary, covered_until')
      .eq('user_id', userId)
      .maybeSingle()
    if (memErr) throw memErr

    let summary      = mem?.summary ?? ''
    const coveredUntil = mem?.covered_until ?? null

    // All turns newer than the summary watermark, oldest → newest.
    let query = admin
      .from('assistant_messages')
      .select('role, content, general_knowledge, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(FETCH_CAP)
    if (coveredUntil) query = query.gt('created_at', coveredUntil)
    const { data: rows, error: msgErr } = await query
    if (msgErr) throw msgErr

    const uncovered = (rows ?? []).reverse() as StoredTurn[]
    const older     = uncovered.slice(0, Math.max(0, uncovered.length - RECENT_WINDOW))
    const recent    = uncovered.slice(-RECENT_WINDOW)

    // Condense older turns into the rolling summary when enough have
    // accumulated. One extra llm() call roughly every CONDENSE_MIN/2
    // exchanges — never lets a failure break the user's turn.
    if (older.length >= CONDENSE_MIN) {
      try {
        summary = await condense(summary, older)
        await admin.from('assistant_memory').upsert({
          user_id:       userId,
          summary,
          covered_until: older[older.length - 1].created_at,
        })
      } catch (err) {
        console.warn('[assistant] memory condensation skipped:', err)
      }
    }

    return { summary, recent }
  } catch (err) {
    warnOnce(err)
    return { summary: '', recent: [] }
  }
}

async function condense(existingSummary: string, older: StoredTurn[]): Promise<string> {
  const transcript = older
    .map(t => `${t.role === 'user' ? 'User' : 'Lexi'}: ${t.content}`)
    .join('\n')
  return llm(
    [
      {
        role: 'system',
        content:
          'You maintain the long-term memory of Lexi, an in-app assistant for a trainer-management platform. ' +
          'Merge the existing memory and the new conversation excerpt into ONE updated memory of at most 150 words. ' +
          'Keep only what helps future conversations: facts the user shared about themselves, trainers/districts/skills/workshops they asked about, ' +
          'preferences they expressed, and unresolved follow-ups. Drop greetings and pleasantries. ' +
          'Write plain English prose (the memory is internal — replies to the user are phrased separately). ' +
          'Output ONLY the updated memory text.',
      },
      {
        role: 'user',
        content:
          `EXISTING MEMORY:\n${existingSummary || '(none yet)'}\n\n` +
          `NEW CONVERSATION EXCERPT:\n${transcript}`,
      },
    ],
    { temperature: 0.2, maxTokens: 300 },
  )
}

// Persist one exchange. Explicit timestamps (+1 ms for the reply) keep
// ordering deterministic even when both inserts land in the same ms.
export async function saveTurn(
  admin: SupabaseClient,
  userId: string,
  userText: string,
  replyText: string,
  generalKnowledge: boolean,
): Promise<void> {
  try {
    const now = Date.now()
    const { error } = await admin.from('assistant_messages').insert([
      {
        user_id: userId, role: 'user', content: userText,
        created_at: new Date(now).toISOString(),
      },
      {
        user_id: userId, role: 'assistant', content: replyText,
        general_knowledge: generalKnowledge,
        created_at: new Date(now + 1).toISOString(),
      },
    ])
    if (error) throw error
  } catch (err) {
    warnOnce(err)
  }
}

// Wipe the caller's transcript and rolling summary (Clear conversation).
export async function clearMemory(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    const { error: e1 } = await admin.from('assistant_messages').delete().eq('user_id', userId)
    if (e1) throw e1
    const { error: e2 } = await admin.from('assistant_memory').delete().eq('user_id', userId)
    if (e2) throw e2
  } catch (err) {
    warnOnce(err)
  }
}
