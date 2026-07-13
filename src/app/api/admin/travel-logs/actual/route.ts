import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Phase 8 — record the ACTUAL claimed travel cost against a travel_logs
// row (migration 024 added actual_cost_myr/actual_cost_note). Powers
// the cost-estimate-accuracy KPI on /admin/analytics. Admin-only;
// every write is audit-logged. Pass actual_cost_myr: null to clear.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'admin' || profile?.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  let body: { engagement_id?: string; trainer_id?: string; actual_cost_myr?: number | null; actual_cost_note?: string | null }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.engagement_id || !body.trainer_id) {
    return NextResponse.json({ error: 'engagement_id and trainer_id are required' }, { status: 400 })
  }
  const value = body.actual_cost_myr
  if (value !== null && value !== undefined && (typeof value !== 'number' || Number.isNaN(value) || value < 0)) {
    return NextResponse.json({ error: 'actual_cost_myr must be a non-negative number or null' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('travel_logs')
    .update({
      actual_cost_myr:  value ?? null,
      actual_cost_note: body.actual_cost_note?.trim() || null,
    })
    .eq('engagement_id', body.engagement_id)
    .eq('trainer_id', body.trainer_id)
    .select('log_id, estimated_cost_myr, actual_cost_myr, actual_cost_note')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'travel_logs row not found' }, { status: 404 })

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'admin.cost_actual',
    entity_type:  'travel_logs',
    entity_id:    data[0].log_id as string,
    payload_json: {
      engagement_id:     body.engagement_id,
      trainer_id:        body.trainer_id,
      estimated_cost_myr: data[0].estimated_cost_myr,
      actual_cost_myr:   value ?? null,
      note:              body.actual_cost_note ?? null,
      actor_name:        profile?.full_name ?? null,
    },
  })

  return NextResponse.json({ success: true, row: data[0] })
}
