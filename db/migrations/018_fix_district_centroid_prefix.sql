-- ============================================================
-- Migration 018: fix fn_district_centroid PPD-prefix mismatch
-- schools.ppd_district is stored as "PPD KUCHING" but
-- master_trainers.ppd_district (and profiles.ppd_district, per the
-- ApproveModal fix) is stored bare as "KUCHING". fn_district_centroid
-- matched schools.ppd_district directly, so it always returned zero
-- rows for a bare district value — the dashboard silently fell back
-- to the statewide default view instead of zooming to the user's
-- own district.
--
-- Safe to re-run (CREATE OR REPLACE). Run in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_district_centroid(p_district TEXT)
RETURNS TABLE (lat FLOAT, lng FLOAT)
LANGUAGE sql STABLE
AS $$
  SELECT
    AVG(s.latitude)::FLOAT  AS lat,
    AVG(s.longitude)::FLOAT AS lng
  FROM schools s
  WHERE UPPER(s.ppd_district) IN (UPPER(p_district), UPPER('PPD ' || p_district))
    AND s.latitude  IS NOT NULL
    AND s.longitude IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.fn_district_centroid TO authenticated, service_role;
