-- ============================================================
-- Migration 023: Lexi conversation memory
-- Run in Supabase SQL Editor.
-- ============================================================
-- Persists the Lexi chat so conversations survive page reloads
-- and sign-ins, and gives Lexi long-term memory beyond the
-- 12-message context window:
--   assistant_messages — one row per user/Lexi turn, per user.
--   assistant_memory   — one row per user: a rolling LLM-condensed
--                        summary of messages that have scrolled out
--                        of the recent context window. covered_until
--                        marks the created_at of the newest message
--                        already folded into the summary.
-- Writes happen only from server routes via createAdminClient(),
-- hard-scoped to the caller (mirrors the notifications pattern);
-- users can SELECT their own rows via RLS.
-- ============================================================

-- ─── assistant_messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  msg_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role              TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT        NOT NULL,
  general_knowledge BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.assistant_messages IS
  'Lexi chat transcript, one row per turn per user. Loaded by GET /api/assistant/history and as LLM context by POST /api/assistant.';
COMMENT ON COLUMN public.assistant_messages.general_knowledge IS
  'TRUE when the assistant reply came from web_search — restores the amber "general knowledge" badge after reload.';

CREATE INDEX IF NOT EXISTS idx_amsg_user_created
  ON public.assistant_messages (user_id, created_at);

-- ─── assistant_memory ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_memory (
  user_id       UUID        PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  summary       TEXT        NOT NULL DEFAULT '',
  covered_until TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.assistant_memory IS
  'Rolling per-user summary of older Lexi conversation, injected into the system prompt. Maintained by src/lib/assistantMemory.ts.';

DROP TRIGGER IF EXISTS amem_set_updated_at ON public.assistant_memory;
CREATE TRIGGER amem_set_updated_at
  BEFORE UPDATE ON public.assistant_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_memory   ENABLE ROW LEVEL SECURITY;

-- Users read their own chat; there is deliberately NO admin-read-all
-- policy — a user's conversation with Lexi is private to them.
DROP POLICY IF EXISTS amsg_select_own ON public.assistant_messages;
CREATE POLICY amsg_select_own ON public.assistant_messages
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS amem_select_own ON public.assistant_memory;
CREATE POLICY amem_select_own ON public.assistant_memory
  FOR SELECT USING (user_id = auth.uid());

-- No user INSERT/UPDATE/DELETE policies: all writes go through the
-- service-role client in server routes, scoped to the caller's id.
