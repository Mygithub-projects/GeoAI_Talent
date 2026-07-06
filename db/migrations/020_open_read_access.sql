-- ============================================================
-- Migration 020: open trainer/school READ access to all active
-- authenticated users; district/STATEWIDE now drives only the
-- default map view, not row visibility.
--
-- Supersedes 019_state_officer_access.sql. That migration was
-- NEVER run against the live DB and MUST NOT be run — this
-- migration replaces it. Every active authenticated user (any
-- role, any assigned district) now sees ALL 30 PPDs' trainers/
-- schools on read, identical to what admins have always seen.
-- ppd_district/STATEWIDE now only pick the map's default camera
-- position on login (dashboard/page.tsx via fn_district_centroid),
-- never what rows a query returns.
--
-- WRITE ACCESS IS UNCHANGED: the existing *_admin_all policies
-- (FOR ALL USING (is_admin())) on schools/master_trainers/
-- trainer_skills/trainer_roles are untouched — only admins can
-- INSERT/UPDATE/DELETE these tables.
--
-- Run in Supabase SQL Editor, AFTER 018_fix_district_centroid_prefix.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_user TO authenticated, service_role;

-- ── schools ──────────────────────────────────────────────────
DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools
  FOR SELECT USING (public.is_active_user());

-- ── master_trainers ──────────────────────────────────────────
DROP POLICY IF EXISTS trainers_select ON public.master_trainers;
CREATE POLICY trainers_select ON public.master_trainers
  FOR SELECT USING (public.is_active_user());

-- ── trainer_skills ───────────────────────────────────────────
DROP POLICY IF EXISTS ts_select ON public.trainer_skills;
CREATE POLICY ts_select ON public.trainer_skills
  FOR SELECT USING (public.is_active_user());

-- ── trainer_roles ────────────────────────────────────────────
DROP POLICY IF EXISTS tr_select ON public.trainer_roles;
CREATE POLICY tr_select ON public.trainer_roles
  FOR SELECT USING (public.is_active_user());

-- Note: has_statewide_access() from migration 019 is NOT created here —
-- it would be dead code under this model. 019 must not be run.
