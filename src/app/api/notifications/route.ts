import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── In-app notifications (Phase 7) ───────────────────────────────
// GET  → the caller's latest notifications + unread count (RLS lets a
//        user SELECT only their own rows, so the caller client is used).
// POST → mark all of the caller's notifications read. There is no user
//        UPDATE policy on the table, so the write goes through the admin
//        client, hard-scoped to the caller's user_id.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows } = await supabase
    .from('notifications')
    .select('notif_id, type, message_en, message_bm, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const notifications = rows ?? []
  const unread = notifications.filter(n => !n.read_at).length

  return NextResponse.json({ notifications, unread })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)

  return NextResponse.json({ ok: true })
}
