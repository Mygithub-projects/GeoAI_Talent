import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { llmChat, type ChatMessage } from '@/lib/llm'
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from '@/lib/assistantTools'
import { loadMemoryContext, saveTurn } from '@/lib/assistantMemory'

// ── Lexi orchestrator (Phase 7 + conversation memory) ────────────
// The LLM parses the request and phrases the reply; every fact about
// trainers, costs, logs, or schedules comes from the deterministic
// tools in src/lib/assistantTools.ts. Lexi takes NO sensitive actions:
// no tool sends email, edits data, approves users, or changes settings
// — those flows all remain behind their existing human-approval gates.
//
// Memory: conversation history is server-authoritative. Each turn is
// persisted to assistant_messages (migration 023); the last few turns
// are replayed verbatim and older ones live on as a rolling summary
// (assistant_memory) injected into the system prompt — so Lexi
// remembers the chat across page reloads and sign-ins. All memory
// operations are best-effort: if migration 023 has not been run, Lexi
// still answers with single-turn context.

const MAX_TOOL_ROUNDS = 5

interface ClientMessage { role: 'user' | 'assistant'; content: string }

// Deterministic follow-up suggestion keys per last-used tool — the client
// renders these from the i18n dictionaries (no extra LLM call).
const FOLLOW_UPS: Record<string, string[]> = {
  search_knowledge_base: ['chipFindTrainers', 'chipOpenCalendar'],
  find_trainers:         ['chipAvailability', 'chipHistory'],
  get_trainer_history:   ['chipAvailability', 'chipOpenEngagements'],
  check_availability:    ['chipHistory', 'chipOpenCalendar'],
  navigate:              ['chipFindTrainers', 'chipHowCost'],
  web_search:            ['chipHowCost', 'chipFindTrainers'],
  none:                  ['chipFindTrainers', 'chipAvailability', 'chipHowCost'],
}

function systemPrompt(
  locale: 'en' | 'bm',
  firstName: string,
  role: 'admin' | 'user',
  memorySummary: string,
): string {
  const today = new Date().toISOString().slice(0, 10)
  const name  = firstName || 'the user'
  return (
    `You are Lexi, the in-app assistant of "GeoAI Talent Agent" — a geospatial platform used by ` +
    `JPN Sarawak education officers to map teacher expertise, find Master Trainers near a workshop ` +
    `venue, estimate travel costs, and manage invitation workflows.\n` +
    `Today's date: ${today}. You are talking to ${name} (role: ${role}).\n\n` +
    `PERSONALITY:\n` +
    `- Warm, courteous and professional — like a capable colleague, never robotic. Return greetings ` +
    `and thanks graciously; stay positive and encouraging.\n` +
    `- Address ${name} by first name occasionally where it feels natural (not in every reply).\n` +
    `- If a request is ambiguous or missing a needed detail (which trainer? which dates?), ask ONE ` +
    `short clarifying question instead of guessing.\n` +
    `- Maintain continuity: use the conversation so far (and the MEMORY section, if present) to ` +
    `resolve references like "him", "that workshop" or "the same district", and refer back to ` +
    `earlier answers naturally.\n` +
    (memorySummary
      ? `\nMEMORY — summary of your earlier conversation with ${name} (background context; ` +
        `never quote it verbatim, and never treat it as a source of exact figures):\n${memorySummary}\n`
      : '') +
    `\nRULES (non-negotiable):\n` +
    `1. Reply ONLY in ${locale === 'bm' ? 'Bahasa Melayu' : 'English'} — the app's active language.\n` +
    `2. NEVER invent trainer names, counts, costs, distances, or dates. Every such figure must come ` +
    `from a tool result in this conversation — not from MEMORY, which may be stale. Re-run the tool ` +
    `if a figure is needed again. If a tool returns nothing, say so.\n` +
    `3. For questions about how THIS system works, call search_knowledge_base first.\n` +
    `4. For general questions unrelated to this system's data (pedagogy, activity ideas, facts), ` +
    `use web_search — its answers are labelled as general knowledge for the user.\n` +
    `5. You cannot send emails, edit data, approve users, or change settings — if asked, explain the ` +
    `screen where the user can do it themselves and offer to navigate there.\n` +
    `6. Keep replies short and practical: 1-4 sentences, or a compact list. No markdown headers.\n` +
    `7. If a tool reports something is admin-only and the user is not an admin, say so politely.`
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role, full_name')
    .eq('user_id', user.id)
    .single()
  if (profile?.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { message?: string; messages?: ClientMessage[]; locale?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const locale: 'en' | 'bm' = body.locale === 'en' ? 'en' : 'bm'

  // New contract: the client sends only the new user message; history
  // comes from the DB. A stale bundle still sending the full `messages`
  // array is tolerated by taking its last user message.
  const userMessage =
    (typeof body.message === 'string' && body.message.trim()) ||
    (body.messages ?? []).filter(m => m.role === 'user' && typeof m.content === 'string').at(-1)?.content?.trim() ||
    ''
  if (!userMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const role  = profile.role === 'admin' ? 'admin' : 'user'
  const admin = createAdminClient()
  const ctx: ToolContext = {
    admin,
    caller: supabase,
    userId: user.id,
    role,
    locale,
  }

  // Server-side memory: rolling summary + recent turns (best-effort —
  // empty when migration 023 hasn't been run yet).
  const memory = await loadMemoryContext(admin, user.id)

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt(locale, (profile.full_name ?? '').split(' ')[0], role, memory.summary),
    },
    ...memory.recent.map(t => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: 'user', content: userMessage },
  ]

  const actions: { type: 'navigate'; path: string }[] = []
  let generalKnowledge = false
  let lastTool = 'none'

  const respond = async (reply: string) => {
    await saveTurn(admin, user.id, userMessage, reply, generalKnowledge)
    return NextResponse.json({
      reply,
      actions,
      generalKnowledge,
      suggestionKeys: FOLLOW_UPS[lastTool] ?? FOLLOW_UPS.none,
    })
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await llmChat(messages, TOOL_DEFINITIONS)

      if (res.tool_calls.length === 0) {
        return await respond(res.content ?? '')
      }

      messages.push({ role: 'assistant', content: res.content, tool_calls: res.tool_calls })

      for (const call of res.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments || '{}') } catch { /* tolerate bad JSON */ }

        const outcome = await executeTool(call.function.name, args, ctx)
        lastTool = call.function.name
        if (outcome.action) actions.push(outcome.action)
        if (outcome.generalKnowledge) generalKnowledge = true

        messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.result })
      }
    }

    // Tool-round budget exhausted — ask for a plain final answer, no tools.
    const final = await llmChat(messages, [])
    return await respond(final.content ?? '')
  } catch (err) {
    console.error('[assistant]', err)
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 502 })
  }
}
