import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type EngagementAccessResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

// Any authenticated user may act on an engagement they created; admins may
// act on any engagement. Used by the invite/preview/reinvite/confirm/cancel
// routes, whose writes all go through the service-role admin client (RLS
// does not apply), so this check is the actual access boundary.
export async function checkEngagementAccess(
  admin: AdminClient,
  engagementId: string,
  userId: string,
  role: string | undefined,
): Promise<EngagementAccessResult> {
  if (role === 'admin') return { ok: true }

  const { data: engagement } = await admin
    .from('training_engagements')
    .select('created_by')
    .eq('engagement_id', engagementId)
    .single()

  if (!engagement) return { ok: false, status: 404, error: 'Engagement not found' }
  if (engagement.created_by !== userId) {
    return { ok: false, status: 403, error: 'You can only manage engagements you created.' }
  }
  return { ok: true }
}
