import { createAdminClient } from '@/lib/supabase/admin'
import { validateFeedbackToken } from '@/lib/feedbackToken'
import { getTrainerLocale } from '@/lib/trainerLocale'
import { FeedbackFormClient } from './_components/FeedbackFormClient'
import { FeedbackStatus } from './_components/FeedbackStatus'

export const dynamic = 'force-dynamic'

// Phase 9 — public post-workshop feedback form. Trainers are not app
// users: the signed single-use token in the emailed link is the only
// authentication (same placement/pattern as /invitations/responded).
// The server component validates the token and renders either the form
// or the matching terminal state; the submit API re-validates
// independently.
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const admin = createAdminClient()
  const result = await validateFeedbackToken(admin, token)

  if (result.status !== 'valid') {
    return <FeedbackStatus state={result.status} />
  }

  // token_id stays server-side — the client only needs the raw token
  // (which it already has in the URL) and the display context.
  const { token_id: _tokenId, ...context } = result.context
  void _tokenId
  // Open in the language this trainer's invitation used (migration 028;
  // defaults BM) so the whole flow reads consistently.
  const initialLocale = await getTrainerLocale(admin, context.engagement_id, context.trainer_id)
  return <FeedbackFormClient token={token!} context={context} initialLocale={initialLocale} />
}
