import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySignedToken, hashToken } from '@/lib/tokenSigning'
import { resolveVenueName } from '@/lib/email'
import { ConfirmClient } from './_components/ConfirmClient'

export const dynamic = 'force-dynamic'

// Public confirmation step for invitation accept/decline links
// (2026-07-13). The email link (GET) lands here; NOTHING is recorded
// until the trainer presses the confirm button, which POSTs to
// /api/invitations/respond. This is what stops email security scanners
// — which prefetch GET links — from auto-responding on the trainer's
// behalf.
export default async function InvitationConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token || !verifySignedToken(token)) redirect('/invitations/responded?result=invalid')

  const admin = createAdminClient()

  const { data: tokenRow } = await admin
    .from('invitation_tokens')
    .select('engagement_id, trainer_id, action_scope, expires_at, used_at')
    .eq('token_hash', hashToken(token))
    .single()

  if (!tokenRow) redirect('/invitations/responded?result=invalid')
  if (tokenRow.used_at) redirect('/invitations/responded?result=already_used')
  if (new Date(tokenRow.expires_at) < new Date()) redirect('/invitations/responded?result=expired')

  const { data: engTrainer } = await admin
    .from('engagement_trainers')
    .select('status')
    .eq('engagement_id', tokenRow.engagement_id)
    .eq('trainer_id', tokenRow.trainer_id)
    .single()

  if (!engTrainer) redirect('/invitations/responded?result=invalid')
  if (engTrainer.status !== 'Pending Invite') redirect('/invitations/responded?result=already_used')

  const [{ data: engagement }, { data: trainer }] = await Promise.all([
    admin
      .from('training_engagements')
      .select('training_title, dynamic_venue_name, venue_school_code, start_date, end_date')
      .eq('engagement_id', tokenRow.engagement_id)
      .single(),
    admin
      .from('master_trainers')
      .select('trainer_name')
      .eq('trainer_id', tokenRow.trainer_id)
      .single(),
  ])

  if (!engagement) redirect('/invitations/responded?result=invalid')

  const venueName = await resolveVenueName(admin, engagement!)

  return (
    <ConfirmClient
      token={token}
      action={tokenRow.action_scope === 'accept' ? 'accept' : 'decline'}
      trainerName={trainer?.trainer_name ?? null}
      trainingTitle={engagement!.training_title ?? null}
      venueName={venueName}
      startDate={engagement!.start_date ?? null}
      endDate={engagement!.end_date ?? null}
    />
  )
}
