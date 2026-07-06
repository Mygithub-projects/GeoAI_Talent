-- ============================================================
-- GEO-TALENT AGENT -- Combined migration (001 to 005)
-- Paste this ENTIRE script into Supabase SQL Editor and run.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT everywhere.
-- ============================================================


-- ==================== 001_profiles.sql ====================

-- ============================================================
-- Migration 001: profiles table
-- Run in Supabase SQL editor (Database > SQL editor)
-- ============================================================

-- Enable uuid-ossp if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (one row per auth user)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        TEXT,
  email            TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'user'
                               CHECK (role IN ('admin', 'user')),
  ppd_district     TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'active', 'suspended')),
  preferred_language TEXT      NOT NULL DEFAULT 'bm'
                               CHECK (preferred_language IN ('en', 'bm')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'One row per auth.users account; drives role-based access and district scoping.';
COMMENT ON COLUMN public.profiles.status IS 'pending = awaiting admin approval; active = can use the system; suspended = locked out.';
COMMENT ON COLUMN public.profiles.ppd_district IS 'District assignment set by admin; NULL for state-wide JPN admins.';


-- ==================== 002_admin_allowlist.sql ====================

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


-- ==================== 003_functions_triggers.sql ====================

-- ============================================================
-- Migration 003: helper functions + triggers
-- Run AFTER 002_admin_allowlist.sql
-- ============================================================

-- ─── Helper: is_admin() ──────────────────────────────────────
-- SECURITY DEFINER so it bypasses RLS when called from policies.
-- Returns TRUE when the calling user is an active admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND role   = 'admin'
      AND status = 'active'
  );
$$;

-- ─── Trigger: handle_new_user ────────────────────────────────
-- Fires AFTER INSERT on auth.users.
-- Creates the matching profiles row.
-- Allowlisted emails are auto-set to role=admin, status=active on sign-up.
-- All other registrations start as role=user, status=pending (await admin approval).
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── Trigger: enforce profile update rules ───────────────────
-- Prevents self-promotion (non-admins cannot change role/status/ppd_district).
-- Also prevents removing the last active admin.
CREATE OR REPLACE FUNCTION public.enforce_profile_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_uid  UUID    := auth.uid();
  v_acting_admin BOOLEAN;
  v_admin_count  INT;
BEGIN
  -- Service role (uid is null) may bypass all checks
  IF v_current_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = v_current_uid AND role = 'admin' AND status = 'active'
  ) INTO v_acting_admin;

  IF v_acting_admin THEN
    -- Last-admin guard: cannot demote or suspend the last active admin
    IF (OLD.role = 'admin' AND OLD.status = 'active')
       AND (NEW.role != 'admin' OR NEW.status != 'active') THEN
      SELECT COUNT(*) INTO v_admin_count
      FROM profiles
      WHERE role = 'admin' AND status = 'active' AND user_id != OLD.user_id;

      IF v_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot change this account: it is the last active administrator.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Non-admin: block changes to privileged columns
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: only administrators can change the role.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: only administrators can change account status.';
  END IF;
  IF NEW.ppd_district IS DISTINCT FROM OLD.ppd_district THEN
    RAISE EXCEPTION 'Permission denied: only administrators can change district assignment.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_rules_trigger ON public.profiles;
CREATE TRIGGER enforce_profile_rules_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_rules();

-- ─── Trigger: auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ==================== 004_rls_policies.sql ====================

-- ============================================================
-- Migration 004: Row-Level Security policies
-- Run AFTER 003_functions_triggers.sql
-- ============================================================

-- ─── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: own row OR any row if admin
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- INSERT: handle_new_user trigger runs as SECURITY DEFINER (bypasses RLS).
-- Also allow authenticated users to insert their own row (edge-case recovery).
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: own row OR any row if admin.
-- The enforce_profile_rules trigger blocks self-promotion regardless.
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- DELETE: admin only (soft-delete preferred, but allow hard delete if needed)
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- ─── admin_allowlist ─────────────────────────────────────────
ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;

-- Only active admins can read or manage the allowlist
CREATE POLICY "allowlist_admin_only"
  ON public.admin_allowlist FOR ALL
  USING (public.is_admin());

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_email_idx        ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_status_idx       ON public.profiles (status);
CREATE INDEX IF NOT EXISTS profiles_role_idx         ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_ppd_district_idx ON public.profiles (ppd_district);


-- ==================== 005_full_schema.sql ====================

-- ============================================================
-- Migration 005: Full schema — Phase 1
-- Run in Supabase SQL Editor AFTER migrations 001–004.
-- Enables PostGIS + pgvector, creates all tables, indexes,
-- seeds travel_rates, and adds RLS for every new table.
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- STATIC TABLES
-- ============================================================

-- ---- schools ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  school_code        TEXT             PRIMARY KEY,
  school_name        TEXT             NOT NULL,
  state              TEXT,
  ppd_district       TEXT,
  level              TEXT,
  school_type        TEXT,
  address            TEXT,
  postcode           TEXT,
  city               TEXT,
  longitude          DOUBLE PRECISION,
  latitude           DOUBLE PRECISION,
  geom               GEOMETRY(Point, 4326),
  accessibility_tier TEXT             NOT NULL DEFAULT 'road'
                                      CHECK (accessibility_tier IN ('road','boat','flight')),
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.schools IS 'JPN Sarawak school registry. geom auto-populated from longitude/latitude by trigger.';
COMMENT ON COLUMN public.schools.accessibility_tier IS 'road|boat|flight — curated by JPN; drives travel-mode logic in Phase 4.';

-- Auto-populate geom from longitude/latitude
CREATE OR REPLACE FUNCTION public.fn_school_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.longitude IS NOT NULL AND NEW.latitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_school_geom ON public.schools;
CREATE TRIGGER trg_school_geom
  BEFORE INSERT OR UPDATE OF longitude, latitude
  ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.fn_school_geom();

-- Auto-update updated_at
DROP TRIGGER IF EXISTS schools_set_updated_at ON public.schools;
CREATE TRIGGER schools_set_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- master_trainers ----------------------------------------
CREATE TABLE IF NOT EXISTS public.master_trainers (
  trainer_id               TEXT             PRIMARY KEY,
  trainer_name             TEXT             NOT NULL,
  email                    TEXT,
  ppd_district             TEXT,
  workstation_school_code  TEXT             REFERENCES public.schools(school_code)
                                            ON UPDATE CASCADE ON DELETE SET NULL,
  workstation_long         DOUBLE PRECISION,
  workstation_lat          DOUBLE PRECISION,
  workstation_geom         GEOMETRY(Point, 4326),
  level                    TEXT,
  coord_source             TEXT,
  created_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.master_trainers IS 'One row per trainer (deduplicated). workstation_geom derived from school code or own coordinates.';
COMMENT ON COLUMN public.master_trainers.coord_source IS 'original = from the cleaned dataset; manual = corrected by admin.';

CREATE OR REPLACE FUNCTION public.fn_trainer_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workstation_long IS NOT NULL AND NEW.workstation_lat IS NOT NULL THEN
    NEW.workstation_geom := ST_SetSRID(ST_MakePoint(NEW.workstation_long, NEW.workstation_lat), 4326);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_trainer_geom ON public.master_trainers;
CREATE TRIGGER trg_trainer_geom
  BEFORE INSERT OR UPDATE OF workstation_long, workstation_lat
  ON public.master_trainers
  FOR EACH ROW EXECUTE FUNCTION public.fn_trainer_geom();

DROP TRIGGER IF EXISTS trainers_set_updated_at ON public.master_trainers;
CREATE TRIGGER trainers_set_updated_at
  BEFORE UPDATE ON public.master_trainers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- skills_subjects (taxonomy/translation source) ----------
CREATE TABLE IF NOT EXISTS public.skills_subjects (
  item_id             SERIAL  PRIMARY KEY,
  type                TEXT    NOT NULL CHECK (type IN ('SKILL','SUBJECT')),
  name_en             TEXT    NOT NULL,
  name_bm             TEXT    NOT NULL,
  category_en         TEXT,
  category_bm         TEXT,
  ict_specialisation  TEXT,
  UNIQUE (type, name_en)
);

COMMENT ON TABLE  public.skills_subjects IS 'Bilingual taxonomy: ICT SKILLs and teaching SUBJECTs. Both languages stored; UI shows the active one.';
COMMENT ON COLUMN public.skills_subjects.type IS 'SKILL = ICT skill; SUBJECT = teaching subject.';

-- ---- trainer_skills (bridge) --------------------------------
CREATE TABLE IF NOT EXISTS public.trainer_skills (
  id         SERIAL  PRIMARY KEY,
  trainer_id TEXT    NOT NULL REFERENCES public.master_trainers(trainer_id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES public.skills_subjects(item_id)    ON DELETE CASCADE,
  UNIQUE (trainer_id, item_id)
);

COMMENT ON TABLE public.trainer_skills IS 'Many-to-many bridge: one trainer can hold many skills/subjects.';

-- ---- trainer_roles (optional) -------------------------------
CREATE TABLE IF NOT EXISTS public.trainer_roles (
  id         SERIAL PRIMARY KEY,
  trainer_id TEXT   NOT NULL REFERENCES public.master_trainers(trainer_id) ON DELETE CASCADE,
  role       TEXT   NOT NULL
);

COMMENT ON TABLE public.trainer_roles IS 'Optional: named programme roles a trainer holds (e.g. MASTER TRAINER, GPGD).';

-- ============================================================
-- CONFIG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.travel_rates (
  rate_key        TEXT          PRIMARY KEY,
  rate_myr        NUMERIC(10,2) NOT NULL,
  unit            TEXT          NOT NULL CHECK (unit IN ('per_km','flat')),
  note            TEXT,
  effective_from  DATE          NOT NULL DEFAULT CURRENT_DATE,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.travel_rates IS 'Editable cost-rate config. Services read these; nothing is hardcoded. Admins edit via Phase 8 UI.';

-- ============================================================
-- DYNAMIC TABLES
-- ============================================================

-- ---- training_engagements -----------------------------------
CREATE TABLE IF NOT EXISTS public.training_engagements (
  engagement_id       UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  training_title      TEXT,
  target_item_id      INTEGER          REFERENCES public.skills_subjects(item_id),
  dynamic_venue_name  TEXT,
  venue_school_code   TEXT             REFERENCES public.schools(school_code),
  venue_lat           DOUBLE PRECISION,
  venue_long          DOUBLE PRECISION,
  venue_geom          GEOMETRY(Point, 4326),
  search_radius_km    NUMERIC(6,1)     NOT NULL DEFAULT 50,
  start_date          DATE,
  end_date            DATE,
  assigned_trainer_id TEXT             REFERENCES public.master_trainers(trainer_id),
  workflow_status     TEXT             NOT NULL DEFAULT 'Draft'
                                       CHECK (workflow_status IN
                                         ('Draft','Pending Invite','Confirmed','Declined','Cancelled')),
  created_by          UUID             REFERENCES public.profiles(user_id),
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.training_engagements.dynamic_venue_name  IS 'Free-text venue name (geocoded hotel, hall, etc.) — usually not in schools registry.';
COMMENT ON COLUMN public.training_engagements.venue_school_code   IS 'Set only when the venue happens to be a school/PPD from the registry.';
COMMENT ON COLUMN public.training_engagements.search_radius_km    IS 'Shared radius slider value (0–500 km) stored for reproducibility.';

CREATE OR REPLACE FUNCTION public.fn_venue_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.venue_long IS NOT NULL AND NEW.venue_lat IS NOT NULL THEN
    NEW.venue_geom := ST_SetSRID(ST_MakePoint(NEW.venue_long, NEW.venue_lat), 4326);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_venue_geom ON public.training_engagements;
CREATE TRIGGER trg_venue_geom
  BEFORE INSERT OR UPDATE OF venue_long, venue_lat
  ON public.training_engagements
  FOR EACH ROW EXECUTE FUNCTION public.fn_venue_geom();

DROP TRIGGER IF EXISTS engagements_set_updated_at ON public.training_engagements;
CREATE TRIGGER engagements_set_updated_at
  BEFORE UPDATE ON public.training_engagements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- travel_logs --------------------------------------------
CREATE TABLE IF NOT EXISTS public.travel_logs (
  log_id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id            UUID          NOT NULL REFERENCES public.training_engagements(engagement_id) ON DELETE CASCADE,
  trainer_id               TEXT          NOT NULL REFERENCES public.master_trainers(trainer_id),
  calculated_distance_km   NUMERIC(8,2),
  calculated_duration_min  INTEGER,
  suggested_transport_mode TEXT          CHECK (suggested_transport_mode IN ('Road','Boat','Flight')),
  estimated_cost_myr       NUMERIC(10,2),
  cost_source              TEXT          CHECK (cost_source IN ('formula','search','llm','manual')),
  cost_note                TEXT,
  computed_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (engagement_id, trainer_id)
);

COMMENT ON COLUMN public.travel_logs.cost_source IS 'formula=deterministic land rate; search=web search; llm=LLM estimate; manual=admin override.';

-- ---- invitation_tokens --------------------------------------
CREATE TABLE IF NOT EXISTS public.invitation_tokens (
  token_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID        NOT NULL REFERENCES public.training_engagements(engagement_id) ON DELETE CASCADE,
  trainer_id    TEXT        NOT NULL REFERENCES public.master_trainers(trainer_id),
  token_hash    TEXT        NOT NULL UNIQUE,
  action_scope  TEXT        NOT NULL CHECK (action_scope IN ('accept','decline')),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ
);

COMMENT ON TABLE public.invitation_tokens IS 'Signed single-use tokens in accept/decline invitation links. Server-side only; no direct client access.';

-- ---- audit_logs ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  log_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor        UUID        REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  payload_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_logs IS 'Immutable audit trail. Written via service key; actor=NULL means system action.';

-- ============================================================
-- SUPPORT TABLES
-- ============================================================

-- ---- knowledge_base (RAG source for the assistant) ----------
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  doc_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en   TEXT,
  title_bm   TEXT,
  content_en TEXT,
  content_bm TEXT,
  tags       TEXT[],
  embedding  VECTOR(1536),  -- placeholder dim; change to match local model when embeddings are added
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.knowledge_base.embedding IS 'pgvector column; NULL until a local embedding model is wired up in Phase 7. FTS used until then.';

DROP TRIGGER IF EXISTS kb_set_updated_at ON public.knowledge_base;
CREATE TRIGGER kb_set_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- notifications ------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  notif_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  message_en TEXT,
  message_bm TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Spatial (GIST)
CREATE INDEX IF NOT EXISTS idx_schools_geom          ON public.schools               USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_trainers_geom         ON public.master_trainers       USING GIST (workstation_geom);
CREATE INDEX IF NOT EXISTS idx_engagements_venue_geom ON public.training_engagements USING GIST (venue_geom);

-- ppd_district (used in RLS and Mode A filtering)
CREATE INDEX IF NOT EXISTS idx_schools_ppd           ON public.schools               (ppd_district);
CREATE INDEX IF NOT EXISTS idx_trainers_ppd          ON public.master_trainers       (ppd_district);

-- skills_subjects.type (SKILL vs SUBJECT filter)
CREATE INDEX IF NOT EXISTS idx_ss_type               ON public.skills_subjects       (type);

-- FK columns
CREATE INDEX IF NOT EXISTS idx_trainers_school       ON public.master_trainers       (workstation_school_code);
CREATE INDEX IF NOT EXISTS idx_ts_trainer            ON public.trainer_skills        (trainer_id);
CREATE INDEX IF NOT EXISTS idx_ts_item               ON public.trainer_skills        (item_id);
CREATE INDEX IF NOT EXISTS idx_tr_trainer            ON public.trainer_roles         (trainer_id);
CREATE INDEX IF NOT EXISTS idx_eng_item              ON public.training_engagements  (target_item_id);
CREATE INDEX IF NOT EXISTS idx_eng_venue_school      ON public.training_engagements  (venue_school_code);
CREATE INDEX IF NOT EXISTS idx_eng_trainer           ON public.training_engagements  (assigned_trainer_id);
CREATE INDEX IF NOT EXISTS idx_eng_created_by        ON public.training_engagements  (created_by);
CREATE INDEX IF NOT EXISTS idx_eng_status            ON public.training_engagements  (workflow_status);
CREATE INDEX IF NOT EXISTS idx_tlog_engagement       ON public.travel_logs           (engagement_id);
CREATE INDEX IF NOT EXISTS idx_tlog_trainer          ON public.travel_logs           (trainer_id);
CREATE INDEX IF NOT EXISTS idx_tokens_engagement     ON public.invitation_tokens     (engagement_id);
CREATE INDEX IF NOT EXISTS idx_tokens_trainer        ON public.invitation_tokens     (trainer_id);
CREATE INDEX IF NOT EXISTS idx_tokens_hash           ON public.invitation_tokens     (token_hash);
CREATE INDEX IF NOT EXISTS idx_audit_actor           ON public.audit_logs            (actor);
CREATE INDEX IF NOT EXISTS idx_audit_entity          ON public.audit_logs            (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notif_user            ON public.notifications         (user_id);

-- ============================================================
-- SEED: travel_rates
-- Source: JPN Sarawak travel reimbursement policy (as provided).
-- Flight/boat fares are NOT seeded — estimated at runtime in Phase 4.
-- ============================================================

INSERT INTO public.travel_rates (rate_key, rate_myr, unit, note, effective_from)
VALUES
  (
    'road_per_km_0_500',
    1.00, 'per_km',
    'Road transport: RM1.00/km when total journey ≤ 500 km. Source: JPN Sarawak travel policy. Confirm exact rate with JPN Finance before production.',
    CURRENT_DATE
  ),
  (
    'road_per_km_over_500',
    0.90, 'per_km',
    'Road transport: RM0.90/km when total journey > 500 km. Source: JPN Sarawak travel policy. Confirm exact rate with JPN Finance before production.',
    CURRENT_DATE
  ),
  (
    'subsistence_per_night',
    0.00, 'flat',
    'Per-night subsistence/accommodation allowance (MYR). Currently 0 — TO BE CONFIRMED with JPN Finance before production use.',
    CURRENT_DATE
  )
ON CONFLICT (rate_key) DO UPDATE
  SET rate_myr       = EXCLUDED.rate_myr,
      note           = EXCLUDED.note,
      updated_at     = NOW();

-- ============================================================
-- ROW-LEVEL SECURITY
-- Policy: standard users scoped to their own ppd_district.
-- Admins (is_admin()) see and modify everything.
-- is_admin() is defined in migration 003.
-- ============================================================

ALTER TABLE public.schools              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_trainers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills_subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_skills       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;

-- ---- schools ------------------------------------------------
DROP POLICY IF EXISTS schools_select    ON public.schools;
DROP POLICY IF EXISTS schools_admin_all ON public.schools;
CREATE POLICY schools_select ON public.schools
  FOR SELECT USING (
    public.is_admin()
    OR ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
  );
CREATE POLICY schools_admin_all ON public.schools
  FOR ALL USING (public.is_admin());

-- ---- master_trainers ----------------------------------------
DROP POLICY IF EXISTS trainers_select    ON public.master_trainers;
DROP POLICY IF EXISTS trainers_admin_all ON public.master_trainers;
CREATE POLICY trainers_select ON public.master_trainers
  FOR SELECT USING (
    public.is_admin()
    OR ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
  );
CREATE POLICY trainers_admin_all ON public.master_trainers
  FOR ALL USING (public.is_admin());

-- ---- skills_subjects (reference data — all authenticated users can read) ----
DROP POLICY IF EXISTS ss_select    ON public.skills_subjects;
DROP POLICY IF EXISTS ss_admin_all ON public.skills_subjects;
CREATE POLICY ss_select ON public.skills_subjects
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY ss_admin_all ON public.skills_subjects
  FOR ALL USING (public.is_admin());

-- ---- trainer_skills -----------------------------------------
DROP POLICY IF EXISTS ts_select    ON public.trainer_skills;
DROP POLICY IF EXISTS ts_admin_all ON public.trainer_skills;
CREATE POLICY ts_select ON public.trainer_skills
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.master_trainers t
      WHERE t.trainer_id = trainer_skills.trainer_id
        AND t.ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
    )
  );
CREATE POLICY ts_admin_all ON public.trainer_skills
  FOR ALL USING (public.is_admin());

-- ---- trainer_roles ------------------------------------------
DROP POLICY IF EXISTS tr_select    ON public.trainer_roles;
DROP POLICY IF EXISTS tr_admin_all ON public.trainer_roles;
CREATE POLICY tr_select ON public.trainer_roles
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.master_trainers t
      WHERE t.trainer_id = trainer_roles.trainer_id
        AND t.ppd_district = (SELECT ppd_district FROM public.profiles WHERE user_id = auth.uid())
    )
  );
CREATE POLICY tr_admin_all ON public.trainer_roles
  FOR ALL USING (public.is_admin());

-- ---- travel_rates (config — all auth users read; admins write) ----
DROP POLICY IF EXISTS rates_select    ON public.travel_rates;
DROP POLICY IF EXISTS rates_admin_all ON public.travel_rates;
CREATE POLICY rates_select ON public.travel_rates
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY rates_admin_all ON public.travel_rates
  FOR ALL USING (public.is_admin());

-- ---- training_engagements -----------------------------------
DROP POLICY IF EXISTS eng_select    ON public.training_engagements;
DROP POLICY IF EXISTS eng_insert    ON public.training_engagements;
DROP POLICY IF EXISTS eng_admin_all ON public.training_engagements;
CREATE POLICY eng_select ON public.training_engagements
  FOR SELECT USING (
    public.is_admin()
    OR created_by = auth.uid()
  );
CREATE POLICY eng_insert ON public.training_engagements
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND created_by = auth.uid()
  );
CREATE POLICY eng_admin_all ON public.training_engagements
  FOR ALL USING (public.is_admin());

-- ---- travel_logs --------------------------------------------
DROP POLICY IF EXISTS tlog_select    ON public.travel_logs;
DROP POLICY IF EXISTS tlog_admin_all ON public.travel_logs;
CREATE POLICY tlog_select ON public.travel_logs
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.training_engagements e
      WHERE e.engagement_id = travel_logs.engagement_id
        AND e.created_by = auth.uid()
    )
  );
CREATE POLICY tlog_admin_all ON public.travel_logs
  FOR ALL USING (public.is_admin());

-- ---- invitation_tokens (server-side only via service key) ---
DROP POLICY IF EXISTS tokens_admin_all ON public.invitation_tokens;
CREATE POLICY tokens_admin_all ON public.invitation_tokens
  FOR ALL USING (public.is_admin());

-- ---- audit_logs (admins read; server writes via service key) ----
DROP POLICY IF EXISTS audit_admin_read ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs
  FOR SELECT USING (public.is_admin());

-- ---- knowledge_base (all authenticated users read; admins write) ----
DROP POLICY IF EXISTS kb_select    ON public.knowledge_base;
DROP POLICY IF EXISTS kb_admin_all ON public.knowledge_base;
CREATE POLICY kb_select ON public.knowledge_base
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY kb_admin_all ON public.knowledge_base
  FOR ALL USING (public.is_admin());

-- ---- notifications (users see their own; admins see all) ----
DROP POLICY IF EXISTS notif_select    ON public.notifications;
DROP POLICY IF EXISTS notif_admin_all ON public.notifications;
CREATE POLICY notif_select ON public.notifications
  FOR SELECT USING (
    public.is_admin() OR user_id = auth.uid()
  );
CREATE POLICY notif_admin_all ON public.notifications
  FOR ALL USING (public.is_admin());
