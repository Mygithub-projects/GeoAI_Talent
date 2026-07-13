-- ============================================================
-- Migration 025: Phase 8B — trainer fit classification
--
-- Adds AI-suggested + human-approved workshop-fit classification
-- to engagement_trainers, for the Reporting Module:
--   * fit_suggestion / fit_reason_en / fit_reason_bm — what the
--     LLM proposed for a not-yet-responded trainer (suggestions
--     are ONLY ever suitable | pending_review | not_matched; a
--     responded trainer's classification is a deterministic fact,
--     not an AI call).
--   * fit_classification — the HUMAN-approved final label
--     (suitable | pending_review | not_matched | confirmed |
--     declined), set only by the workshop creator or an admin,
--     audit-logged by the API.
--   * fit_decided_by / fit_decided_at — who approved it, when.
--
-- Safe to re-run. Run in Supabase SQL Editor (DDL is blocked via
-- the service key).
-- ============================================================

ALTER TABLE public.engagement_trainers
  ADD COLUMN IF NOT EXISTS fit_suggestion     TEXT,
  ADD COLUMN IF NOT EXISTS fit_reason_en      TEXT,
  ADD COLUMN IF NOT EXISTS fit_reason_bm      TEXT,
  ADD COLUMN IF NOT EXISTS fit_suggested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fit_classification TEXT,
  ADD COLUMN IF NOT EXISTS fit_decided_by     UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fit_decided_at     TIMESTAMPTZ;

-- CHECK constraints, added idempotently (PostgreSQL has no
-- ADD CONSTRAINT IF NOT EXISTS).
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engagement_trainers_fit_suggestion_check'
  ) THEN
    ALTER TABLE public.engagement_trainers
      ADD CONSTRAINT engagement_trainers_fit_suggestion_check
      CHECK (fit_suggestion IS NULL OR fit_suggestion IN ('suitable', 'pending_review', 'not_matched'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engagement_trainers_fit_classification_check'
  ) THEN
    ALTER TABLE public.engagement_trainers
      ADD CONSTRAINT engagement_trainers_fit_classification_check
      CHECK (fit_classification IS NULL OR fit_classification IN ('suitable', 'pending_review', 'not_matched', 'confirmed', 'declined'));
  END IF;
END $mig$;
