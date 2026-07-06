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
