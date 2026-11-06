import type { SupabaseClient } from '@supabase/supabase-js'

// Shared rules for booking trainers onto workshops (2026-11-06, migration 031).
//
// - A trainer is "booked" while Pending Invite or Confirmed on a workshop
//   that is not Cancelled. They may never be booked on two workshops whose
//   dates overlap. The database enforces this with triggers (error code
//   23P01); the app checks first so it can show a friendly message.
// - Invitation links last INVITE_EXPIRY_DAYS but never past the end of the
//   workshop's start day (Sarawak time). Once a link has expired unanswered,
//   the hourly fn_release_unanswered_invites() job releases the trainer
//   ('No Response') — nothing is ever re-sent automatically.

export const INVITE_EXPIRY_DAYS = parseInt(process.env.INVITE_EXPIRY_DAYS ?? '7', 10)

export const BOOKED_STATUSES = ['Pending Invite', 'Confirmed'] as const

// Statuses a coordinator can re-invite from (user decision 2026-11-06:
// a Declined trainer may be re-invited too, if needed)
export const REINVITABLE_STATUSES = ['Pending Invite', 'No Response', 'Declined'] as const

export type TrainerInviteStatus = 'Pending Invite' | 'Confirmed' | 'Declined' | 'No Response'

// Link expiry for an invite sent `now` for a workshop starting `startDate`
// (YYYY-MM-DD): INVITE_EXPIRY_DAYS from now, capped at 23:59:59 Sarawak
// time (UTC+8, no DST) on the start date. Same cap the hourly release job
// applies on the database side.
export function inviteLinkExpiry(startDate: string | null | undefined, now: Date = new Date()): Date {
  const byDays = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return byDays
  const startCap = new Date(`${startDate}T23:59:59+08:00`)
  return startCap < byDays ? startCap : byDays
}

export interface BookingConflict {
  trainer_id:     string
  engagement_id:  string
  training_title: string | null
  start_date:     string
  end_date:       string
  status:         string
}

// For each trainer, the first OTHER non-cancelled workshop overlapping
// [startDate, endDate] on which they are already Pending/Confirmed.
// Trainers with no clash are absent from the map.
export async function findBookingConflicts(
  admin: SupabaseClient,
  trainerIds: string[],
  startDate: string | null,
  endDate: string | null,
  excludeEngagementId: string | null,
): Promise<Map<string, BookingConflict>> {
  const out = new Map<string, BookingConflict>()
  if (trainerIds.length === 0 || !startDate || !endDate) return out

  const { data: rows } = await admin
    .from('engagement_trainers')
    .select('trainer_id, engagement_id, status')
    .in('trainer_id', trainerIds)
    .in('status', [...BOOKED_STATUSES])
  const others = (rows ?? []).filter(r => r.engagement_id !== excludeEngagementId)
  if (others.length === 0) return out

  const { data: engs } = await admin
    .from('training_engagements')
    .select('engagement_id, training_title, start_date, end_date')
    .in('engagement_id', [...new Set(others.map(r => r.engagement_id as string))])
    .neq('workflow_status', 'Cancelled')
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .order('start_date', { ascending: true })
  const engById = new Map((engs ?? []).map(e => [e.engagement_id as string, e]))

  for (const r of others) {
    const e = engById.get(r.engagement_id as string)
    if (!e || out.has(r.trainer_id as string)) continue
    out.set(r.trainer_id as string, {
      trainer_id:     r.trainer_id as string,
      engagement_id:  e.engagement_id as string,
      training_title: (e.training_title as string | null) ?? null,
      start_date:     e.start_date as string,
      end_date:       e.end_date as string,
      status:         r.status as string,
    })
  }
  return out
}

// True when a Supabase/PostgREST error is the 031 double-booking guard
export function isBookingConflictError(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === '23P01' || /TRAINER_DATE_CONFLICT/.test(err.message ?? ''))
}

export function describeConflict(c: BookingConflict): string {
  const title = c.training_title ?? 'another workshop'
  const dates = c.start_date === c.end_date ? c.start_date : `${c.start_date} to ${c.end_date}`
  return `${c.trainer_id} is already booked on "${title}" (${dates})`
}
