import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearMemory } from '@/lib/assistantMemory'

// ── Lexi conversation history (migration 023) ────────────────────
// GET    → the caller's recent transcript for the drawer to replay on
//          open (RLS lets a user SELECT only their own rows, so the
//          caller client is used). Returns [] gracefully when the
//          tables don't exist yet.
// DELETE → "Clear conversation": wipes the caller's transcript AND
//          rolling memory summary. No user DELETE policy exists on
//          the tables, so the write goes through the admin client,
//          hard-scoped to the caller's user_id (notifications pattern).

const DISPLAY_LIMIT = 40

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows, error } = await supabase
    .from('assistant_messages')
    .select('role, content, general_knowledge, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(DISPLAY_LIMIT)

  if (error) {
    // Table missing (migration 023 not run) or transient failure —
    // the drawer just starts a fresh conversation.
    console.warn('[assistant/history]', error.message)
    return NextResponse.json({ messages: [] })
  }

  const messages = (rows ?? []).reverse().map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
    generalKnowledge: Boolean(r.general_knowledge),
  }))

  return NextResponse.json({ messages })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await clearMemory(createAdminClient(), user.id)
  return NextResponse.json({ ok: true })
}
