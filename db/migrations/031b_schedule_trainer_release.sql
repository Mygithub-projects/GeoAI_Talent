-- Migration 031b — switch ON the hourly release (2026-11-06)
--
-- Run ONLY after:
--   1. migration 031 is applied, and
--   2. the app code that understands 'No Response' is live
--      (otherwise screens briefly show the raw status).
--
-- Step 1 releases every invitation that has ALREADY expired, SILENTLY
-- (user decision: no bell notifications for the old backlog). The result
-- grid lists exactly who was released.
-- Step 2 schedules the hourly job; from then on each release notifies
-- the workshop's creator.
--
-- Undo: 031_rollback.sql (or, to just stop the job:
--   SELECT cron.unschedule('release-unanswered-invites-hourly'); )

-- ── 1. One-off silent release of the existing backlog ────────
SELECT * FROM public.fn_release_unanswered_invites(p_notify := FALSE);

-- ── 2. Hourly job (minute 5 of every hour) ───────────────────
DO $do$
BEGIN
  PERFORM cron.unschedule('release-unanswered-invites-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job didn't exist yet
END
$do$;

SELECT cron.schedule(
  'release-unanswered-invites-hourly',
  '5 * * * *',
  $cron$ SELECT public.fn_release_unanswered_invites(); $cron$
);

-- Confirm it is scheduled:
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname = 'release-unanswered-invites-hourly';
