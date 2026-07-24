-- Migration 028 — per-invitation email language (2026-07-22)
--
-- Stores the language the coordinator chose when inviting a trainer, so
-- every trainer-facing email for that (engagement, trainer) pair — the
-- invitation, the acceptance receipt, a reschedule notice, the Phase 9
-- feedback request, and a cancellation apology — plus the trainer's
-- accept/decline and feedback landing pages, all render in that one
-- language instead of the historical hard-coded 'bm'.
--
-- 'bm' remains the default (matches every email sent before this change
-- and every automated path that doesn't set it). The app reads this
-- column DEFENSIVELY (src/lib/trainerLocale.ts): before this migration
-- is applied the column is simply absent and every email falls back to
-- 'bm', so email flows keep working either way.
--
-- Simple additive DDL — safe to re-run.

ALTER TABLE public.engagement_trainers
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'bm'
  CHECK (locale IN ('en', 'bm'));
