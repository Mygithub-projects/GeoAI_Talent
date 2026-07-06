import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySignedToken, hashToken } from '@/lib/tokenSigning'
import { recomputeEngagementStatus } from '@/lib/engagementRollup'

// Public — hit directly by a trainer clicking an accept/decline link
// in their invitation email. No app session exists, so every read/
// write here goes through the service-role admin client.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const redirectTo = (result: string) =>
    NextResponse.redirect(new URL(`/invitations/responded?result=${result}`, req.url))

  if (!token || !verifySignedToken(token)) {
    return redirectTo('invalid')
  }

  const admin = createAdminClient()
  const tokenHash = hashToken(token)

  const { data: tokenRow } = await admin
    .from('invitation_tokens')
    .select('token_id, engagement_id, trainer_id, action_scope, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .single()

  if (!tokenRow) return redirectTo('invalid')
  if (tokenRow.used_at) return redirectTo('already_used')
  if (new Date(tokenRow.expires_at) < new Date()) return redirectTo('expired')

  const { data: engTrainer } = await admin
    .from('engagement_trainers')
    .select('id, status')
    .eq('engagement_id', tokenRow.engagement_id)
    .eq('trainer_id', tokenRow.trainer_id)
    .single()

  if (!engTrainer) return redirectTo('invalid')
  if (engTrainer.status !== 'Pending Invite') return redirectTo('already_used')

  const newStatus = tokenRow.action_scope === 'accept' ? 'Confirmed' : 'Declined'

  await admin
    .from('engagement_trainers')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', engTrainer.id)

  // Mark this token used, and invalidate its sibling (accept <-> decline)
  // so neither link can be replayed after the trainer has responded.
  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_id', tokenRow.token_id)

  await admin
    .from('invitation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('engagement_id', tokenRow.engagement_id)
    .eq('trainer_id', tokenRow.trainer_id)
    .neq('action_scope', tokenRow.action_scope)
    .is('used_at', null)

  await recomputeEngagementStatus(admin, tokenRow.engagement_id)

  const { data: trainer } = await admin
    .from('master_trainers')
    .select('trainer_name')
    .eq('trainer_id', tokenRow.trainer_id)
    .single()

  await admin.from('audit_logs').insert({
    actor:        null,
    action:       tokenRow.action_scope === 'accept' ? 'engagement.accept' : 'engagement.decline',
    entity_type:  'training_engagement',
    entity_id:    tokenRow.engagement_id,
    payload_json: {
      trainer_id:   tokenRow.trainer_id,
      trainer_name: trainer?.trainer_name ?? null,
      action:       tokenRow.action_scope,
    },
  })

  return redirectTo(tokenRow.action_scope === 'accept' ? 'accepted' : 'declined')
}
