import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Settings — change the caller's OWN password. Runs server-side (the
// session cookie authenticates the update) because browsers on
// restricted gov/school networks cannot always reach Supabase directly
// — the same reason login is proxied via /api/auth/login.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { password?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort audit — never the password itself, only that it changed
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'user.password_change',
      entity_type:  'profile',
      entity_id:    user.id,
      payload_json: { self_service: true },
    })
  } catch (err) {
    console.error('[settings/password] audit insert failed:', err)
  }

  return NextResponse.json({ success: true })
}
