-- ============================================================
-- 021_placeholder_trainer_emails.sql  (v2)
-- Replace the placeholder trainer emails (@abc-dl.edu.my — 991 rows
-- as of 2026-07-08) with three real, deliverable test inboxes,
-- assigned round-robin by trainer_id order.
--
-- SCOPED: only touches rows still on the @abc-dl.edu.my placeholder
-- domain. Rows already holding a real address (e.g. entered by an
-- admin via the /admin/database console) are never overwritten —
-- safe to re-run at any time.
--
-- Why: makes test sends deliverable once TEST_INBOX_EMAIL is unset,
-- and removes latent bounce risk. Real per-trainer MOE addresses
-- should still replace these before live outreach (editable per
-- trainer in the admin Database console).
--
-- Run in Supabase SQL Editor.
-- ============================================================

WITH numbered AS (
  SELECT
    trainer_id,
    ROW_NUMBER() OVER (ORDER BY trainer_id) AS rn
  FROM public.master_trainers
  WHERE email LIKE '%@abc-dl.edu.my'
)
UPDATE public.master_trainers mt
SET email = CASE numbered.rn % 3
  WHEN 1 THEN 'mich88lim@gmail.com'
  WHEN 2 THEN 'mich88lw@yahoo.com'
  ELSE        'jpn-sarawak-cm79@moe-dl.edu.my'
END
FROM numbered
WHERE mt.trainer_id = numbered.trainer_id;

-- Verify: expect zero rows left on abc-dl.edu.my and roughly a third
-- of all trainers on each of the three test inboxes.
SELECT email, COUNT(*) FROM public.master_trainers GROUP BY email ORDER BY COUNT(*) DESC;
