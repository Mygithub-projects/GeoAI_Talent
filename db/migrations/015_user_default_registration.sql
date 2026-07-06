-- ============================================================
-- Migration 015: all new registrations default to role=user
-- Run in Supabase SQL Editor.
-- ============================================================
-- Previously, allowlisted emails were auto-set to role=admin on sign-up.
-- Now ALL new accounts start as role=user regardless of allowlist status.
-- Allowlisted emails still get status=active (no pending queue) so they
-- can log in immediately — an admin then promotes them via the user console.
--
-- NOTE: existing accounts are NOT changed by this migration.
-- To set the first admin manually, run in Supabase SQL Editor:
--   UPDATE profiles SET role = 'admin' WHERE email = 'wun@iegcampus.com';
-- ============================================================

-- ─── Update handle_new_user trigger ─────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowlisted BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_allowlist WHERE email = NEW.email
  ) INTO v_allowlisted;

  INSERT INTO profiles (user_id, email, full_name, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    'user',
    CASE WHEN v_allowlisted THEN 'active' ELSE 'pending' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─── Update allowlist table comment ─────────────────────────
COMMENT ON TABLE public.admin_allowlist IS
  'Emails in this list bypass the domain restriction on registration. They are auto-set to status=active (can log in immediately) but start as role=user — an admin promotes them via the user management console.';
