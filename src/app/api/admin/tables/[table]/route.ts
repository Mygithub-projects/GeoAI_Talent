import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminTable, type AdminTableDef } from '@/lib/adminTables'

// ── Admin Database Console CRUD ──────────────────────────────────
// Generic per-table list/create/update/delete, restricted to the
// tables and columns declared in src/lib/adminTables.ts. Admin-only
// (role re-checked here on every call — proxy.ts does not guard /api).
// Every mutation writes an audit_logs row.

const PAGE_SIZE_MAX = 100

interface Ctx { params: Promise<{ table: string }> }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'admin' || profile?.status !== 'active') {
    return { error: NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 }) }
  }
  return { user, profile }
}

async function resolveTable(ctx: Ctx): Promise<AdminTableDef | null> {
  const { table } = await ctx.params
  return getAdminTable(table)
}

/** Coerce + validate a request body against the registry's editable columns. */
function sanitizeValues(
  def: AdminTableDef,
  raw: Record<string, unknown>,
  { includePk, requireRequired }: { includePk: boolean; requireRequired: boolean },
): { values: Record<string, unknown> } | { error: string } {
  const allowed = new Map(def.columns.map(c => [c.name, c]))
  const values: Record<string, unknown> = {}

  for (const [key, v] of Object.entries(raw)) {
    const col = allowed.get(key)
    if (!col) return { error: `Unknown column "${key}" for table "${def.name}"` }
    if (col.name === def.primaryKey && !includePk) continue

    if (v === null || v === undefined || v === '') {
      values[key] = null
      continue
    }
    switch (col.type) {
      case 'number': {
        const n = Number(v)
        if (Number.isNaN(n)) return { error: `"${col.name}" must be a number` }
        values[key] = n
        break
      }
      case 'integer': {
        const n = Number(v)
        if (!Number.isInteger(n)) return { error: `"${col.name}" must be an integer` }
        values[key] = n
        break
      }
      case 'select': {
        if (!col.options?.includes(String(v))) {
          return { error: `"${col.name}" must be one of: ${col.options?.join(', ')}` }
        }
        values[key] = String(v)
        break
      }
      case 'tags': {
        const arr = Array.isArray(v)
          ? v.map(x => String(x).trim()).filter(Boolean)
          : String(v).split(',').map(s => s.trim()).filter(Boolean)
        values[key] = arr.length ? arr : null
        break
      }
      default:
        values[key] = String(v)
    }
  }

  if (requireRequired) {
    for (const col of def.columns) {
      if (!col.required) continue
      if (col.name === def.primaryKey && def.pkAuto) continue
      if (values[col.name] === null || values[col.name] === undefined) {
        return { error: `"${col.name}" is required` }
      }
    }
  }
  return { values }
}

function friendlyDbError(err: { code?: string; message?: string }): { message: string; status: number } {
  switch (err.code) {
    case '23503': return { message: 'This row is referenced by other data (foreign key). Remove the dependent rows first.', status: 409 }
    case '23505': return { message: 'A row with this key/value already exists (unique constraint).', status: 409 }
    case '23514': return { message: 'A value violates a database check constraint.', status: 400 }
    default:      return { message: err.message ?? 'Database error', status: 500 }
  }
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  actorName: string | null | undefined,
  action: string,
  table: string,
  entityId: unknown,
  payload: Record<string, unknown>,
) {
  await admin.from('audit_logs').insert({
    actor:        actorId,
    action,
    entity_type:  table,
    entity_id:    String(entityId ?? ''),
    payload_json: { ...payload, actor_name: actorName ?? null },
  })
}

// ── GET: paginated list + optional search ────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const def = await resolveTable(ctx)
  if (!def) return NextResponse.json({ error: 'Unknown table' }, { status: 404 })

  const sp       = req.nextUrl.searchParams
  const page     = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10) || 25))
  const q        = (sp.get('q') ?? '').trim()
  const showDeleted = def.softDelete && sp.get('deleted') === '1'

  const selectCols = [def.primaryKey, ...def.columns.map(c => c.name).filter(n => n !== def.primaryKey)]
  if (def.softDelete) selectCols.push('deleted_at')
  const admin = createAdminClient()

  let query = admin
    .from(def.name)
    .select(selectCols.join(', '), { count: 'exact' })
    .order(def.orderBy, { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (def.softDelete) {
    query = showDeleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  }
  if (q) query = query.ilike(def.searchColumn, `%${q.replace(/[%_]/g, '\\$&')}%`)

  const { data, count, error } = await query
  if (error) {
    const f = friendlyDbError(error)
    return NextResponse.json({ error: f.message }, { status: f.status })
  }
  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize })
}

// ── POST: create one row ─────────────────────────────────────────
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const def = await resolveTable(ctx)
  if (!def) return NextResponse.json({ error: 'Unknown table' }, { status: 404 })

  let raw: Record<string, unknown>
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = sanitizeValues(def, raw, { includePk: !def.pkAuto, requireRequired: true })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(def.name)
    .insert(parsed.values)
    .select()
    .single()

  if (error) {
    const f = friendlyDbError(error)
    return NextResponse.json({ error: f.message }, { status: f.status })
  }

  const pkValue = (data as Record<string, unknown>)[def.primaryKey]
  await writeAudit(admin, auth.user.id, auth.profile?.full_name, 'admin.table_create', def.name, pkValue, { values: parsed.values })
  return NextResponse.json({ success: true, row: data })
}

// ── PATCH: update one row by primary key ─────────────────────────
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const def = await resolveTable(ctx)
  if (!def) return NextResponse.json({ error: 'Unknown table' }, { status: 404 })

  let body: { pk?: unknown; values?: Record<string, unknown>; restore?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body.pk === undefined || body.pk === null) {
    return NextResponse.json({ error: 'pk is required' }, { status: 400 })
  }

  // Restore a soft-deleted row (clears deleted_at) — no values needed.
  if (body.restore === true) {
    if (!def.softDelete) {
      return NextResponse.json({ error: `Table "${def.name}" does not support restore` }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from(def.name)
      .update({ deleted_at: null })
      .eq(def.primaryKey, body.pk)
      .not('deleted_at', 'is', null)
      .select()

    if (error) {
      const f = friendlyDbError(error)
      return NextResponse.json({ error: f.message }, { status: f.status })
    }
    if (!data?.length) return NextResponse.json({ error: 'Row not found (or not deleted)' }, { status: 404 })

    await writeAudit(admin, auth.user.id, auth.profile?.full_name, 'admin.table_restore', def.name, body.pk, { restored_row: data[0] })
    return NextResponse.json({ success: true, row: data[0] })
  }

  if (!body.values || typeof body.values !== 'object') {
    return NextResponse.json({ error: 'pk and values are required' }, { status: 400 })
  }

  // Never allow changing the primary key itself via PATCH.
  const parsed = sanitizeValues(def, body.values, { includePk: false, requireRequired: false })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (Object.keys(parsed.values).length === 0) {
    return NextResponse.json({ error: 'No editable values provided' }, { status: 400 })
  }
  // Required columns may be edited, but not blanked out.
  for (const col of def.columns) {
    if (col.required && col.name in parsed.values && parsed.values[col.name] === null) {
      return NextResponse.json({ error: `"${col.name}" is required and cannot be empty` }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(def.name)
    .update(parsed.values)
    .eq(def.primaryKey, body.pk)
    .select()

  if (error) {
    const f = friendlyDbError(error)
    return NextResponse.json({ error: f.message }, { status: f.status })
  }
  if (!data?.length) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

  await writeAudit(admin, auth.user.id, auth.profile?.full_name, 'admin.table_update', def.name, body.pk, { values: parsed.values })
  return NextResponse.json({ success: true, row: data[0] })
}

// ── DELETE: soft-delete (registry tables) or hard-delete ─────────
// Registry tables (softDelete in adminTables.ts) get deleted_at set —
// the row disappears from the app but stays restorable and keeps
// historical engagements intact. Config tables without the flag
// (trainer_roles, travel_rates, knowledge_base) delete for real.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const def = await resolveTable(ctx)
  if (!def) return NextResponse.json({ error: 'Unknown table' }, { status: 404 })

  let body: { pk?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body.pk === undefined || body.pk === null) {
    return NextResponse.json({ error: 'pk is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const base = admin.from(def.name)
  const { data, error } = def.softDelete
    ? await base
        .update({ deleted_at: new Date().toISOString() })
        .eq(def.primaryKey, body.pk)
        .is('deleted_at', null)
        .select()
    : await base
        .delete()
        .eq(def.primaryKey, body.pk)
        .select()

  if (error) {
    const f = friendlyDbError(error)
    return NextResponse.json({ error: f.message }, { status: f.status })
  }
  if (!data?.length) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

  await writeAudit(admin, auth.user.id, auth.profile?.full_name, 'admin.table_delete', def.name, body.pk, {
    mode: def.softDelete ? 'soft' : 'hard',
    deleted_row: data[0],
  })
  return NextResponse.json({ success: true, soft: !!def.softDelete })
}
