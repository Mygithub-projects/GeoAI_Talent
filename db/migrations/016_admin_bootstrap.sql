-- ============================================================
-- Migration 016: owner admin bootstrap
-- Run in Supabase SQL Editor.
-- ============================================================
-- Restores auto-admin behaviour for the three owner accounts:
--   wun@iegcampus.com, mich88lim@gmail.com, michelle.lim@gmail.com
-- All other new registrations remain role=user, status=pending.
--
-- Also replaces the old michelle.lim@moe.gov.my entry in the
-- allowlist with michelle.lim@gmail.com.
-- ============================================================

-- ─── Update allowlist ────────────────────────────────────────
DELETE FROM public.admin_allowlist WHERE email = 'michelle.lim@moe.gov.my';

INSERT INTO public.admin_allowlist (email) VALUES
  ('wun@iegcampus.com'),
  ('mich88lim@gmail.com'),
  ('michelle.lim@gmail.com')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.admin_allowlist IS
  'Emails in this list bypass the domain restriction on registration and are auto-set to role=admin, status=active by the handle_new_user trigger. All other accounts start as role=user, status=pending.';

-- ─── Promote existing owner accounts ─────────────────────────
UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE email IN ('wun@iegcampus.com', 'mich88lim@gmail.com', 'michelle.lim@gmail.com')
  AND (role != 'admin' OR status != 'active');

-- ─── Restore handle_new_user trigger ─────────────────────────
-- Allowlisted → admin + active; everyone else → user + pending.
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
    CASE WHEN v_allowlisted THEN 'admin' ELSE 'user' END,
    CASE WHEN v_allowlisted THEN 'active' ELSE 'pending' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
