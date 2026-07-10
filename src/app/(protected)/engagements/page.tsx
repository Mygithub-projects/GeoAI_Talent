import { redirect } from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BacklogClient, type WorkshopRow, type TrainerInviteRow, type AuditRow } from './_components/BacklogClient'

export const dynamic = 'force-dynamic'

export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  // ── Auth ──────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/awaiting-approval')

  const isAdmin = profile.role === 'admin'

  // Non-admins always see their own activity; admins default to everyone's
  // and can opt into their own via ?scope=mine.
  const { scope: scopeParam } = await searchParams
  const scope: 'mine' | 'all' = isAdmin && scopeParam !== 'mine' ? 'all' : 'mine'

  const admin = createAdminClient()

  // 1. Workshops (engagements) — scoped to the caller's own when scope === 'mine'
  let engagementsQuery = admin
    .from('training_engagements')
    .select('engagement_id, training_title, dynamic_venue_name, start_date, end_date, trainers_needed, workflow_status, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(200)
  if (scope === 'mine') {
    engagementsQuery = engagementsQuery.eq('created_by', user.id)
  }
  const { data: rawEngagements } = await engagementsQuery

  const engagements = rawEngagements ?? []
  const engagementIds = engagements.map(e => e.engagement_id as string)

  const creatorIds = [...new Set(
    engagements.map(e => e.created_by as string | null).filter(Boolean) as string[]
  )]
  const { data: creators } = creatorIds.length > 0
    ? await admin.from('profiles').select('user_id, full_name').in('user_id', creatorIds)
    : { data: [] }
  const creatorMap = Object.fromEntries(
    (creators ?? []).map((p: { user_id: string; full_name: string | null }) => [p.user_id, p.full_name])
  )

  // 2. Per-trainer invite rows
  const { data: rawTrainerInvites } = engagementIds.length > 0
    ? await admin
        .from('engagement_trainers')
        .select('id, engagement_id, trainer_id, status, invited_at, responded_at')
        .in('engagement_id', engagementIds)
        .order('invited_at', { ascending: true })
    : { data: [] }

  const trainerIds = [...new Set((rawTrainerInvites ?? []).map(t => t.trainer_id as string))]
  const { data: trainers } = trainerIds.length > 0
    ? await admin.from('master_trainers').select('trainer_id, trainer_name, email').in('trainer_id', trainerIds)
    : { data: [] }
  const trainerMap = Object.fromEntries(
    (trainers ?? []).map((t: { trainer_id: string; trainer_name: string | null; email: string | null }) =>
      [t.trainer_id, t]
    )
  )

  // 3. Invitation token expiry, per (engagement_id, trainer_id).
  // Only LIVE tokens — after a reinvite/reschedule the old rotated-out
  // tokens still exist with used_at set, and last-write-wins here would
  // show a dead token's expiry.
  const { data: tokens } = engagementIds.length > 0
    ? await admin
        .from('invitation_tokens')
        .select('engagement_id, trainer_id, expires_at')
        .in('engagement_id', engagementIds)
        .eq('action_scope', 'accept')
        .is('used_at', null)
    : { data: [] }

  const tokenExpiryMap: Record<string, string> = {}
  for (const tok of tokens ?? []) {
    tokenExpiryMap[`${tok.engagement_id}:${tok.trainer_id}`] = tok.expires_at as string
  }

  // 4. Group trainer invites by engagement
  const trainersByEngagement: Record<string, TrainerInviteRow[]> = {}
  for (const row of rawTrainerInvites ?? []) {
    const engId = row.engagement_id as string
    const tid   = row.trainer_id as string
    const entry = trainerMap[tid]
    const trainerRow: TrainerInviteRow = {
      engagement_trainer_id: row.id as string,
      trainer_id:        tid,
      trainer_name:      entry?.trainer_name ?? null,
      trainer_email:     entry?.email ?? null,
      status:            row.status as TrainerInviteRow['status'],
      invited_at:        row.invited_at as string,
      responded_at:      (row.responded_at as string | null) ?? null,
      invite_expires_at: tokenExpiryMap[`${engId}:${tid}`] ?? null,
    }
    ;(trainersByEngagement[engId] ??= []).push(trainerRow)
  }

  // 5. Build workshop rows
  const workshopRows: WorkshopRow[] = engagements.map(e => {
    const engId    = e.engagement_id as string
    const uid      = e.created_by as string | null
    const trainers = trainersByEngagement[engId] ?? []
    return {
      engagement_id:      engId,
      training_title:     (e.training_title as string | null) ?? null,
      dynamic_venue_name: (e.dynamic_venue_name as string | null) ?? null,
      start_date:         (e.start_date as string | null) ?? null,
      end_date:           (e.end_date as string | null) ?? null,
      trainers_needed:    (e.trainers_needed as number | null) ?? 1,
      workflow_status:    e.workflow_status as string,
      created_at:         e.created_at as string,
      creator_name:       uid ? creatorMap[uid] ?? null : null,
      trainers,
      confirmedCount:     trainers.filter(t => t.status === 'Confirmed').length,
    }
  })

  // 6. Audit log — scoped to the caller's own actions when scope === 'mine'
  let auditQuery = admin
    .from('audit_logs')
    .select('log_id, actor, action, entity_type, entity_id, payload_json, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (scope === 'mine') {
    auditQuery = auditQuery.eq('actor', user.id)
  }
  const { data: rawAudit } = await auditQuery

  const auditActorIds = [...new Set(
    (rawAudit ?? []).map(a => a.actor as string | null).filter(Boolean) as string[]
  )]
  const { data: auditActors } = auditActorIds.length > 0
    ? await admin.from('profiles').select('user_id, full_name').in('user_id', auditActorIds)
    : { data: [] }

  const actorMap = Object.fromEntries(
    (auditActors ?? []).map((p: { user_id: string; full_name: string | null }) =>
      [p.user_id, p.full_name ?? 'Unknown']
    )
  )

  const auditRows: AuditRow[] = (rawAudit ?? []).map(a => ({
    log_id:       a.log_id as string,
    actor_name:   a.actor ? (actorMap[a.actor as string] ?? 'System') : 'System',
    action:       a.action as string,
    entity_type:  (a.entity_type as string | null) ?? null,
    entity_id:    (a.entity_id as string | null) ?? null,
    payload_json: (a.payload_json as Record<string, unknown> | null) ?? null,
    created_at:   a.created_at as string,
  }))

  return <BacklogClient workshops={workshopRows} auditLog={auditRows} isAdmin={isAdmin} scope={scope} />
}
