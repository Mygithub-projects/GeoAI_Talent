import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Phase 8A — record a trainer transfer: update the workstation location
// on master_trainers. Admin-only (editing static registry data), fully
// audit-logged, three input methods matching how venues are set:
//   registry — school_code: coordinates AND ppd_district come from the
//              school row (server-authoritative; client coords ignored).
//   geocode  — place name searched + geocoded on the client; lat/lng
//              stored, school link cleared, district left unchanged
//              (an arbitrary place doesn't identify a PPD).
//   pin      — dropped directly on the map; same handling as geocode.
// workstation_geom is derived by the DB trigger (fn_trainer_geom) on
// the lat/long update; coord_source flips to 'manual'. This serves the
// "100% records updated after transfers" KPI.

type Method = 'registry' | 'geocode' | 'pin'

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

  let body: {
    trainer_id?: string
    method?:     Method
    school_code?: string
    place_name?:  string
    lat?:         number
    lng?:         number
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.trainer_id || !body.method || !['registry', 'geocode', 'pin'].includes(body.method)) {
    return NextResponse.json({ error: 'trainer_id and method (registry|geocode|pin) are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: trainer } = await admin
    .from('master_trainers')
    .select('trainer_id, trainer_name, ppd_district, workstation_school_code, workstation_lat, workstation_long, deleted_at')
    .eq('trainer_id', body.trainer_id)
    .single()
  if (!trainer || trainer.deleted_at) {
    return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })
  }

  let update: Record<string, unknown>
  let newSchoolName: string | null = null

  if (body.method === 'registry') {
    if (!body.school_code) {
      return NextResponse.json({ error: 'school_code is required for the registry method' }, { status: 400 })
    }
    const { data: school } = await admin
      .from('schools')
      .select('school_code, school_name, ppd_district, latitude, longitude, deleted_at')
      .eq('school_code', body.school_code)
      .single()
    if (!school || school.deleted_at) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }
    if (school.latitude == null || school.longitude == null) {
      return NextResponse.json({ error: 'That school has no coordinates in the registry' }, { status: 400 })
    }
    newSchoolName = school.school_name as string
    // Trainer districts carry no 'PPD ' prefix; school districts do.
    const district = (school.ppd_district as string | null)?.replace(/^PPD\s+/i, '').trim() || null
    update = {
      workstation_school_code: school.school_code,
      workstation_lat:         school.latitude,
      workstation_long:        school.longitude,
      coord_source:            'manual',
      ...(district ? { ppd_district: district } : {}),
    }
  } else {
    const { lat, lng } = body
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
        || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Valid lat and lng are required for this method' }, { status: 400 })
    }
    update = {
      workstation_school_code: null,   // arbitrary location — no registry link
      workstation_lat:         lat,
      workstation_long:        lng,
      coord_source:            'manual',
    }
  }

  const { data: updated, error: updErr } = await admin
    .from('master_trainers')
    .update(update)
    .eq('trainer_id', body.trainer_id)
    .select('trainer_id, trainer_name, ppd_district, workstation_school_code, workstation_lat, workstation_long')
    .single()
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'Update failed' }, { status: 500 })
  }

  await admin.from('audit_logs').insert({
    actor:        user.id,
    action:       'trainer.workstation_update',
    entity_type:  'master_trainers',
    entity_id:    body.trainer_id,
    payload_json: {
      trainer_name: trainer.trainer_name,
      method:       body.method,
      place_name:   body.method === 'registry' ? newSchoolName : (body.place_name ?? null),
      old: {
        school_code: trainer.workstation_school_code,
        lat:         trainer.workstation_lat,
        lng:         trainer.workstation_long,
        district:    trainer.ppd_district,
      },
      new: {
        school_code: updated.workstation_school_code,
        lat:         updated.workstation_lat,
        lng:         updated.workstation_long,
        district:    updated.ppd_district,
      },
      actor_name: profile?.full_name ?? null,
    },
  })

  return NextResponse.json({
    success: true,
    trainer: { ...updated, school_name: newSchoolName },
  })
}
