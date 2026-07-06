-- ============================================================
-- Migration 019: state officer (statewide read-only) access
-- Adds a "statewide" designation for non-admin users: a profile
-- with ppd_district = 'STATEWIDE' can read schools/trainers across
-- every district, without gaining admin write privileges.
-- 'STATEWIDE' is a sentinel value, not a real district — it will
-- never equal any real master_trainers.ppd_district / schools.ppd_district
-- value, so the plain equality clause alone would never grant access;
-- has_statewide_access() explicitly checks for it.
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── Helper: has_statewide_access() ─────────────────────────────
-- SECURITY DEFINER so it bypasses RLS when called from policies (same
-- pattern as is_admin(), migration 003).
CREATE OR REPLACE FUNCTION public.has_statewide_access()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND ppd_district = 'STATEWIDE'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_statewide_access TO authenticated, service_role;

-- ── schools ──────────────────────────────────────────────────
DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools
  FOR SELECT USING (
    public.has_statewide_access()
    OR ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
  );

-- ── master_trainers ──────────────────────────────────────────
DROP POLICY IF EXISTS trainers_select ON public.master_trainers;
CREATE POLICY trainers_select ON public.master_trainers
  FOR SELECT USING (
    public.has_statewide_access()
    OR ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
  );

-- ── trainer_skills ───────────────────────────────────────────
DROP POLICY IF EXISTS ts_select ON public.trainer_skills;
CREATE POLICY ts_select ON public.trainer_skills
  FOR SELECT USING (
    public.has_statewide_access()
    OR EXISTS (
      SELECT 1 FROM public.master_trainers t
      WHERE t.trainer_id = trainer_skills.trainer_id
        AND t.ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- ── trainer_roles ────────────────────────────────────────────
DROP POLICY IF EXISTS tr_select ON public.trainer_roles;
CREATE POLICY tr_select ON public.trainer_roles
  FOR SELECT USING (
    public.has_statewide_access()
    OR EXISTS (
      SELECT 1 FROM public.master_trainers t
      WHERE t.trainer_id = trainer_roles.trainer_id
        AND t.ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Note: *_admin_all policies (FOR ALL USING (is_admin())) are untouched —
-- a state officer gets broader READ access only, never write/admin privileges.
