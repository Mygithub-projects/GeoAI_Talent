import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Settings — update the caller's OWN display name. Deliberately the
// only profile field a user may self-edit: role, status and district
// stay admin-managed (no self-promotion rule in CLAUDE.md).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, status')
    .eq('user_id', user.id)
    .single()
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { full_name?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  if (fullName.length === 0 || fullName.length > 120) {
    return NextResponse.json({ error: 'full_name must be 1–120 characters' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ full_name: fullName })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort audit — the name appears in audit logs and notifications
  try {
    await admin.from('audit_logs').insert({
      actor:        user.id,
      action:       'profile.self_update',
      entity_type:  'profile',
      entity_id:    user.id,
      payload_json: { field: 'full_name', previous: profile.full_name ?? null, new: fullName },
    })
  } catch (err) {
    console.error('[settings/profile] audit insert failed:', err)
  }

  return NextResponse.json({ success: true, full_name: fullName })
}
