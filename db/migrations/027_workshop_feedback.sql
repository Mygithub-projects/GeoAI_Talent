-- ============================================================
-- Migration 027: Post-workshop trainer feedback (Phase 9)
-- Run in Supabase SQL Editor AFTER migrations 001–026.
-- ============================================================
-- Adds the automated feedback-collection pipeline:
--   - engagement_trainers.feedback_email_sent_at / feedback_deadline_at
--     (idempotency guard for the daily cron; deadline = sent + 14 days)
--   - feedback_tokens: signed single-use links, mirrors invitation_tokens
--     (kept separate — a feedback token is consumed by a full form
--     submission, not one click, so it must not share the accept/decline
--     action_scope semantics)
--   - workshop_feedback: submitted ratings/comments, one row per
--     (engagement, trainer)
--   - fn_pending_feedback_recipients(): the cron route's eligibility
--     query (mirrors the fn_available_trainers RPC pattern)
--   - pg_cron + pg_net daily job calling the protected app route
--
-- ⚠ MANUAL POST-MIGRATION STEP (once per environment, in the SQL
--   Editor — deliberately NOT in this file so no URL/secret lands in
--   git; pg_cron reads these via current_setting()):
--     ALTER DATABASE postgres SET app.settings.feedback_cron_url    = 'https://<app-host>/api/cron/feedback-requests';
--     ALTER DATABASE postgres SET app.settings.feedback_cron_secret = '<same value as CRON_SECRET in .env.local>';
-- ============================================================

-- ─── engagement_trainers: feedback-request tracking ───────────
ALTER TABLE public.engagement_trainers
  ADD COLUMN IF NOT EXISTS feedback_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_deadline_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.engagement_trainers.feedback_email_sent_at IS
  'Set the first (and only) time the post-workshop feedback request email is sent to this trainer for this engagement. NULL = not yet sent. Prevents duplicate sends on subsequent daily cron runs.';
COMMENT ON COLUMN public.engagement_trainers.feedback_deadline_at IS
  'feedback_email_sent_at + 14 days — the fill-by deadline stated in the email. Stored (not recomputed) so it never drifts.';

CREATE INDEX IF NOT EXISTS idx_engtr_feedback_pending
  ON public.engagement_trainers (engagement_id, trainer_id)
  WHERE status = 'Confirmed' AND feedback_email_sent_at IS NULL;

-- ─── feedback_tokens ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback_tokens (
  token_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID        NOT NULL REFERENCES public.training_engagements(engagement_id) ON DELETE CASCADE,
  trainer_id    TEXT        NOT NULL REFERENCES public.master_trainers(trainer_id),
  token_hash    TEXT        NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.feedback_tokens IS
  'Signed single-use tokens in post-workshop feedback-request links. Server-side only (service-role client); one row per (engagement, trainer) feedback request. Mirrors invitation_tokens'' hash-only storage.';

CREATE INDEX IF NOT EXISTS idx_fbtok_engagement ON public.feedback_tokens (engagement_id);
CREATE INDEX IF NOT EXISTS idx_fbtok_trainer    ON public.feedback_tokens (trainer_id);

-- ─── workshop_feedback ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workshop_feedback (
  feedback_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id          UUID        NOT NULL REFERENCES public.training_engagements(engagement_id) ON DELETE CASCADE,
  trainer_id             TEXT        NOT NULL REFERENCES public.master_trainers(trainer_id),
  rating_content         SMALLINT    NOT NULL CHECK (rating_content         BETWEEN 1 AND 5),
  rating_materials       SMALLINT    NOT NULL CHECK (rating_materials       BETWEEN 1 AND 5),
  rating_venue_logistics SMALLINT    NOT NULL CHECK (rating_venue_logistics BETWEEN 1 AND 5),
  rating_communication   SMALLINT    NOT NULL CHECK (rating_communication   BETWEEN 1 AND 5),
  rating_overall         SMALLINT    NOT NULL CHECK (rating_overall         BETWEEN 1 AND 5),
  would_recommend        BOOLEAN     NOT NULL,
  comments               TEXT,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (engagement_id, trainer_id)
);

COMMENT ON TABLE public.workshop_feedback IS
  'One row per (engagement, trainer): the submitted post-workshop feedback form. The UNIQUE constraint is the DB-level backstop for "one submission per trainer per workshop" (the token is single-use so this should never conflict).';
COMMENT ON COLUMN public.workshop_feedback.rating_content         IS '1-5: content relevance.';
COMMENT ON COLUMN public.workshop_feedback.rating_materials       IS '1-5: trainer materials/resources provided.';
COMMENT ON COLUMN public.workshop_feedback.rating_venue_logistics IS '1-5: venue & logistics.';
COMMENT ON COLUMN public.workshop_feedback.rating_communication   IS '1-5: organizer communication.';
COMMENT ON COLUMN public.workshop_feedback.rating_overall         IS '1-5: overall satisfaction.';

CREATE INDEX IF NOT EXISTS idx_fb_engagement ON public.workshop_feedback (engagement_id);
CREATE INDEX IF NOT EXISTS idx_fb_trainer    ON public.workshop_feedback (trainer_id);

-- ─── Row-Level Security ───────────────────────────────────────
-- Follows the engagement_trainers / invitation_tokens precedent:
-- transactional data — admin-write, creator-scoped read; tokens are
-- server-side only.
ALTER TABLE public.feedback_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fbtok_admin_all ON public.feedback_tokens;
CREATE POLICY fbtok_admin_all ON public.feedback_tokens
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS fb_select    ON public.workshop_feedback;
DROP POLICY IF EXISTS fb_admin_all ON public.workshop_feedback;

-- SELECT: admins see everything; a non-admin creator sees feedback for
-- engagements they created (mirrors engagement_trainers' engtr_select).
-- No trainer-facing policy: trainers are not auth users — they only
-- ever write once via the public token-gated API route (service-role
-- client, unaffected by RLS).
CREATE POLICY fb_select ON public.workshop_feedback
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.training_engagements e
      WHERE e.engagement_id = workshop_feedback.engagement_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY fb_admin_all ON public.workshop_feedback
  FOR ALL USING (public.is_admin());

-- ─── Eligibility RPC for the cron route ───────────────────────
-- A (engagement, trainer) pair is due a feedback request when the
-- trainer Confirmed, the workshop rolled up to Confirmed, the workshop
-- is completed (end_date < today — completion is inferred, not a
-- stored status), and no request has been sent yet. SECURITY DEFINER
-- mirrors fn_available_trainers; only service_role may execute.
CREATE OR REPLACE FUNCTION public.fn_pending_feedback_recipients()
RETURNS TABLE (
  engagement_trainer_id UUID,
  engagement_id         UUID,
  trainer_id            TEXT,
  trainer_name          TEXT,
  trainer_email         TEXT,
  training_title        TEXT,
  dynamic_venue_name    TEXT,
  venue_school_code     TEXT,
  start_date            DATE,
  end_date              DATE
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT et.id, et.engagement_id, et.trainer_id, mt.trainer_name, mt.email,
         te.training_title, te.dynamic_venue_name, te.venue_school_code,
         te.start_date, te.end_date
  FROM engagement_trainers et
  JOIN training_engagements te ON te.engagement_id = et.engagement_id
  JOIN master_trainers mt      ON mt.trainer_id    = et.trainer_id
  WHERE et.status = 'Confirmed'
    AND et.feedback_email_sent_at IS NULL
    AND te.workflow_status = 'Confirmed'
    AND te.end_date < CURRENT_DATE;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pending_feedback_recipients() FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pending_feedback_recipients() TO service_role;

-- ─── pg_cron + pg_net daily job ───────────────────────────────
-- The job's only responsibility is "invoke the app route on a
-- schedule" — all detection/sending logic lives in the route, which is
-- idempotent (feedback_email_sent_at guard), so a duplicate or missed
-- tick is harmless. 01:15 UTC = 09:15 MYT daily.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Re-runnable: drop any previous schedule of the same name first.
DO $do$
BEGIN
  PERFORM cron.unschedule('trigger-feedback-requests-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job didn't exist yet
END
$do$;

SELECT cron.schedule(
  'trigger-feedback-requests-daily',
  '15 1 * * *',
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.settings.feedback_cron_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', current_setting('app.settings.feedback_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  $cron$
);

-- Inspect / remove later:
--   SELECT * FROM cron.job WHERE jobname = 'trigger-feedback-requests-daily';
--   SELECT cron.unschedule('trigger-feedback-requests-daily');
