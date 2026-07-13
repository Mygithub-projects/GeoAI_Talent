-- Migration 026 — unify the Tatau Sebauh district spelling (2026-07-12)
--
-- The ingested data spelled one district two ways: 'PPD TATAU/SEBAUH'
-- (schools table, 30 rows — schools carry a 'PPD ' prefix) plus
-- 'TATAU/SEBAUH' (15 trainers) and 'TATAU SEBAUH' (14 trainers).
-- Per user decision 2026-07-12 the canonical value is 'TATAU SEBAUH'
-- (no slash, uppercase like every other district; schools keep their
-- 'PPD ' prefix → 'PPD TATAU SEBAUH').
--
-- Pure DML — applied live via the service key on 2026-07-12; kept here
-- so a fresh environment reaches the same state. Idempotent (re-running
-- matches zero rows).
--
-- Code counterpart: src/lib/districts.ts (PPD_DISTRICTS /
-- CANONICAL_PPD_DISTRICTS / canonicalizeDistrict) updated in the same
-- change. The LIVE fn_district_centroid substring-matches the profile
-- district against schools.ppd_district (verified 2026-07-12: 'KUCHING'
-- and 'PPD KUCHING' both resolve), so 'TATAU SEBAUH' profiles resolve
-- once the schools row says 'PPD TATAU SEBAUH'.

UPDATE public.schools
SET    ppd_district = 'PPD TATAU SEBAUH'
WHERE  ppd_district = 'PPD TATAU/SEBAUH';

UPDATE public.master_trainers
SET    ppd_district = 'TATAU SEBAUH'
WHERE  ppd_district = 'TATAU/SEBAUH';

-- Any user account assigned to the district under the old spelling
-- (keeps the default-camera lookup via fn_district_centroid working).
UPDATE public.profiles
SET    ppd_district = 'TATAU SEBAUH'
WHERE  ppd_district = 'TATAU/SEBAUH';
