import type { createAdminClient } from '@/lib/supabase/admin'
import { resolveVenueName } from '@/lib/email'
import type { TrainerInviteStatus } from '@/lib/trainerBooking'

type AdminClient = ReturnType<typeof createAdminClient>

// One workshop + its invited trainers, as the search screen needs them.
// Shared by GET /api/engagements/status (live refresh) and the dashboard
// page, which loads it SERVER-side when opened from the Calendar's Invite
// button so the map starts at the venue instead of flying in from the
// statewide view (2026-11-06). Callers must check access first
// (checkEngagementAccess) — this reads through the service-role client.

export interface InvitedTrainerSnapshot {
  trainer_id:   string
  trainer_name: string
  status:       TrainerInviteStatus
  invited_at:   string
  responded_at: string | null
}

export interface EngagementSnapshot {
  engagement: {
    engagement_id:    string
    training_title:   string | null
    venue_name:       string
    venue_lat:        number | null
    venue_long:       number | null
    start_date:       string | null
    end_date:         string | null
    target_item_id:   number | null
    // All skills of the latest search (migration 031); [] when unknown
    target_item_ids:  number[]
    search_radius_km: number | null
    workflow_status:  string
  }
  trainers_needed: number
  confirmed_count: number
  trainers:        InvitedTrainerSnapshot[]
}

export async function getEngagementSnapshot(admin: AdminClient, engagementId: string): Promise<EngagementSnapshot | null> {
  const BASE_COLS = 'trainers_needed, training_title, dynamic_venue_name, venue_school_code, venue_lat, venue_long, start_date, end_date, target_item_id, search_radius_km, workflow_status'
  let { data: engagement, error: engErr } = await admin
    .from('training_engagements')
    .select(`${BASE_COLS}, target_item_ids`)
    .eq('engagement_id', engagementId)
    .single<Record<string, unknown>>()
  // Self-heal until migration 031 (target_item_ids) is applied
  if (engErr && /target_item_ids/i.test(engErr.message ?? '')) {
    ;({ data: engagement, error: engErr } = await admin
      .from('training_engagements')
      .select(BASE_COLS)
      .eq('engagement_id', engagementId)
      .single<Record<string, unknown>>())
  }
  if (engErr || !engagement) return null

  const savedIds = Array.isArray(engagement.target_item_ids) ? (engagement.target_item_ids as number[]) : []
  const targetItemIds = savedIds.length > 0
    ? savedIds
    : engagement.target_item_id != null ? [engagement.target_item_id as number] : []

  const [{ data: rows }, venueName] = await Promise.all([
    admin
      .from('engagement_trainers')
      .select('trainer_id, status, invited_at, responded_at')
      .eq('engagement_id', engagementId)
      .order('invited_at', { ascending: true }),
    resolveVenueName(admin, engagement as { dynamic_venue_name?: string | null; venue_school_code?: string | null }),
  ])

  const trainerIds = [...new Set((rows ?? []).map(r => r.trainer_id as string))]
  const { data: trainers } = trainerIds.length > 0
    ? await admin.from('master_trainers').select('trainer_id, trainer_name').in('trainer_id', trainerIds)
    : { data: [] }
  const nameMap = Object.fromEntries(
    (trainers ?? []).map((t: { trainer_id: string; trainer_name: string | null }) => [t.trainer_id, t.trainer_name])
  )

  const trainerStatuses: InvitedTrainerSnapshot[] = (rows ?? []).map(r => ({
    trainer_id:   r.trainer_id as string,
    trainer_name: nameMap[r.trainer_id as string] ?? 'Unknown',
    status:       r.status as TrainerInviteStatus,
    invited_at:   r.invited_at as string,
    responded_at: (r.responded_at as string | null) ?? null,
  }))

  return {
    engagement: {
      engagement_id:    engagementId,
      training_title:   engagement.training_title as string | null,
      venue_name:       venueName,
      venue_lat:        engagement.venue_lat as number | null,
      venue_long:       engagement.venue_long as number | null,
      start_date:       engagement.start_date as string | null,
      end_date:         engagement.end_date as string | null,
      target_item_id:   engagement.target_item_id as number | null,
      target_item_ids:  targetItemIds,
      search_radius_km: engagement.search_radius_km == null ? null : Number(engagement.search_radius_km),
      workflow_status:  engagement.workflow_status as string,
    },
    trainers_needed: engagement.trainers_needed as number,
    confirmed_count: trainerStatuses.filter(t => t.status === 'Confirmed').length,
    trainers:        trainerStatuses,
  }
}
