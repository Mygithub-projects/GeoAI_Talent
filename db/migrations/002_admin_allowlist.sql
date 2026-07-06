-- ============================================================
-- Migration 002: admin_allowlist table + initial seed
-- Run AFTER 001_profiles.sql
-- ============================================================

-- Admin allowlist: these emails bypass the domain restriction and are auto-set to
-- role=admin, status=active on sign-up. All other registrations start as role=user.
CREATE TABLE IF NOT EXISTS public.admin_allowlist (
  email       TEXT        PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_allowlist IS
  'Emails in this list bypass the domain restriction on registration and are auto-set to role=admin, status=active by the handle_new_user trigger. All other accounts start as role=user, status=pending.';

-- Seed the owner admin accounts.
-- All three are non-@moe.gov.my; they are domain-exempt via this list.
INSERT INTO public.admin_allowlist (email) VALUES
  ('wun@iegcampus.com'),
  ('mich88lim@gmail.com'),
  ('michelle.lim@gmail.com')
ON CONFLICT DO NOTHING;

-- Fallback: if these accounts registered before this migration, promote them to admin now.
UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE email IN ('wun@iegcampus.com', 'mich88lim@gmail.com', 'michelle.lim@gmail.com')
  AND (role != 'admin' OR status != 'active');
