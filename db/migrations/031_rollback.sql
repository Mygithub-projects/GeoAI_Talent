-- ROLLBACK for migrations 031 + 031b (2026-11-06)
--
-- Puts the database back exactly as it was before 031:
--   1. stops the hourly release job
--   2. removes the double-booking guard triggers + functions
--   3. turns every 'No Response' row back into 'Pending Invite'
--      (their original state) and recomputes those workshops' status
--   4. restores the original 3-value status rule and drops released_at
--      and training_engagements.target_item_ids
--   5. restores Lexi's two help articles to their original text
--
-- Run this AFTER reverting the app code (or at the same time) — the old
-- code does not know 'No Response', which is why step 3 runs first.
-- The audit rows ('engagement.release_no_response') and any bell
-- notifications ('trainer_no_response') are KEPT as history; delete them
-- with the two optional statements at the bottom if wanted.
-- Safe to re-run.

-- ── 1. Stop the job ──────────────────────────────────────────
DO $do$
BEGIN
  PERFORM cron.unschedule('release-unanswered-invites-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled
END
$do$;

-- ── 2. Remove the guards + release functions ─────────────────
DROP TRIGGER  IF EXISTS trg_guard_trainer_overlap  ON public.engagement_trainers;
DROP TRIGGER  IF EXISTS trg_guard_engagement_dates ON public.training_engagements;
DROP FUNCTION IF EXISTS public.fn_guard_trainer_overlap();
DROP FUNCTION IF EXISTS public.fn_guard_engagement_dates();
DROP FUNCTION IF EXISTS public.fn_release_unanswered_invites(BOOLEAN);
DROP FUNCTION IF EXISTS public.fn_unanswered_invite_candidates();

-- ── 3. Released rows back to Pending Invite ──────────────────
DO $$
DECLARE
  ids UUID[];
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'engagement_trainers'
               AND column_name = 'released_at') THEN
    SELECT array_agg(DISTINCT engagement_id) INTO ids
    FROM public.engagement_trainers WHERE status = 'No Response';

    UPDATE public.engagement_trainers
       SET status = 'Pending Invite', released_at = NULL
     WHERE status = 'No Response';

    IF ids IS NOT NULL THEN
      UPDATE public.training_engagements te
         SET workflow_status = CASE
               WHEN s.conf >= te.trainers_needed THEN 'Confirmed'
               WHEN s.pend > 0                   THEN 'Pending Invite'
               ELSE 'Draft' END
        FROM (
          SELECT x.engagement_id,
                 count(*) FILTER (WHERE x.status = 'Confirmed')      AS conf,
                 count(*) FILTER (WHERE x.status = 'Pending Invite') AS pend
          FROM public.engagement_trainers x
          WHERE x.engagement_id = ANY(ids)
          GROUP BY x.engagement_id
        ) s
       WHERE te.engagement_id = s.engagement_id
         AND te.workflow_status <> 'Cancelled';
    END IF;
  END IF;
END $$;

-- ── 4. Original status rule; drop released_at ────────────────
ALTER TABLE public.engagement_trainers DROP CONSTRAINT IF EXISTS engagement_trainers_status_check;
ALTER TABLE public.engagement_trainers
  ADD CONSTRAINT engagement_trainers_status_check
  CHECK (status IN ('Pending Invite', 'Confirmed', 'Declined'));
ALTER TABLE public.engagement_trainers DROP COLUMN IF EXISTS released_at;
ALTER TABLE public.training_engagements DROP COLUMN IF EXISTS target_item_ids;

COMMENT ON COLUMN public.engagement_trainers.status IS
  'Pending Invite = awaiting trainer response; Confirmed = accepted; Declined = declined or admin-withdrawn.';

-- ── 5. Lexi's help articles back to their 022 text ──────────
-- Only where they still carry the text 031 wrote (admin edits kept).
UPDATE public.knowledge_base
   SET content_en = $kb$After a Mode B search you select trainers and press "Finalize & Invite Selected". You review and edit one shared invitation email (personalised per trainer with merge fields) before anything is sent — nothing goes out without this human approval step. Each trainer receives secure, single-use Accept/Decline links that expire in 7 days. Responses update the workshop automatically and notify the coordinator in-app. A trainer who accepted is locked out of overlapping searches for those dates.$kb$,
       content_bm = $kb$Selepas carian Mod B, anda memilih jurulatih dan menekan "Muktamat & Jemput Yang Dipilih". Anda menyemak dan menyunting satu emel jemputan yang dikongsi (diperibadikan bagi setiap jurulatih dengan medan gabungan) sebelum apa-apa dihantar — tiada apa yang keluar tanpa langkah kelulusan manusia ini. Setiap jurulatih menerima pautan Terima/Tolak selamat, sekali guna, yang luput dalam 7 hari. Respons mengemas kini bengkel secara automatik dan memberitahu penyelaras dalam aplikasi. Jurulatih yang menerima dikunci daripada carian bertindih untuk tarikh tersebut.$kb$,
       tags = ARRAY['invitation','jemputan','email','accept','decline','workflow'],
       updated_at = NOW()
 WHERE title_en = $kb$Invitation workflow and trainer responses$kb$
   AND content_en = $kb$After a Mode B search you select trainers and press "Finalize & Invite Selected". You review and edit one shared invitation email (personalised per trainer with merge fields) before anything is sent — nothing goes out without this human approval step. Each trainer receives secure, single-use Accept/Decline links that expire after 7 days, or at the end of the workshop's start day if that comes first. Responses update the workshop automatically and notify the coordinator in-app. A trainer who has been invited or has accepted is held only for that workshop's dates — they stay available for any other dates, and the system never books a trainer onto two overlapping workshops. If a trainer does not respond before the link expires, they are released automatically as "No Response" and the coordinator is notified; nothing is re-sent automatically. To invite more trainers, or re-invite someone, open the workshop in the Calendar and press "Invite trainers" — the search screen opens with that workshop's details and its available trainers already listed.$kb$;
UPDATE public.knowledge_base
   SET content_en = $kb$A workshop's status rolls up from its trainer invitations. Draft: created, nothing sent yet. Pending Invite: at least one invitation is awaiting a response. Confirmed: enough trainers accepted (meets "trainers needed"). Declined: shown per-trainer when someone declines. Cancelled: the whole workshop was cancelled — its history is kept but it cannot be reopened. Per-trainer statuses are Pending Invite, Confirmed, or Declined.$kb$,
       content_bm = $kb$Status bengkel dirumuskan daripada jemputan jurulatihnya. Draf: dicipta, belum ada yang dihantar. Menunggu Jemputan: sekurang-kurangnya satu jemputan menunggu respons. Disahkan: cukup jurulatih menerima (memenuhi "jurulatih diperlukan"). Ditolak: dipaparkan bagi setiap jurulatih yang menolak. Dibatalkan: seluruh bengkel dibatalkan — sejarahnya disimpan tetapi tidak boleh dibuka semula. Status bagi setiap jurulatih ialah Menunggu Jemputan, Disahkan, atau Ditolak.$kb$,
       tags = ARRAY['status','draft','pending','confirmed','declined','cancelled','draf','disahkan'],
       updated_at = NOW()
 WHERE title_en = $kb$Workshop statuses explained$kb$
   AND content_en = $kb$A workshop's status rolls up from its trainer invitations. Draft: created, nothing sent yet. Pending Invite: at least one invitation is awaiting a response. Confirmed: enough trainers accepted (meets "trainers needed"). Declined: shown per-trainer when someone declines. Cancelled: the whole workshop was cancelled — its history is kept but it cannot be reopened. Per-trainer statuses are Pending Invite, Confirmed, Declined, or No Response (did not reply before the invitation expired and was released back to the trainer pool; can be re-invited). If released or declined trainers leave a workshop short, it goes back to Draft.$kb$;

NOTIFY pgrst, 'reload schema';

-- ── Optional: also remove the history these created ──────────
-- DELETE FROM public.notifications WHERE type = 'trainer_no_response';
-- DELETE FROM public.audit_logs    WHERE action = 'engagement.release_no_response';
