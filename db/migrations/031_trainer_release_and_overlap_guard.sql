-- Migration 031 — release unanswered invites + no double-booking (2026-11-06)
--
-- User decisions 2026-11-06:
--   * A trainer is locked ONLY for the dates of a workshop they are Pending
--     or Confirmed on (already true in fn_available_trainers since 029).
--   * A Pending Invite trainer is RELEASED once their invitation has
--     expired — no unused link still valid, or the workshop's start date
--     has passed (new links are capped at the start date by the app). The
--     row becomes 'No Response'; nothing is ever re-sent automatically.
--   * The workshop's creator gets one bilingual bell notification per
--     workshop. The FIRST run (031b) is silent.
--   * A trainer may NEVER be Pending/Confirmed on two overlapping,
--     non-cancelled workshops. Enforced HERE, in the database, so no route,
--     race or future feature can get round it. Re-invite, manual confirm and
--     reschedule are BLOCKED on a clash (the app checks first and shows a
--     friendly message; these triggers are the guarantee).
--
-- Also adds training_engagements.target_item_ids (all searched skills, so a
-- workshop reopened from the Calendar keeps its full criteria).
--
-- This file only DEFINES things. It changes no existing row, and it does
-- NOT start the hourly job — that is 031b, run after the app code is live.
-- Undo with 031_rollback.sql. Safe to re-run.

-- ── 1. 'No Response' status + released_at ────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.engagement_trainers'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.engagement_trainers DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.engagement_trainers
  ADD CONSTRAINT engagement_trainers_status_check
  CHECK (status IN ('Pending Invite', 'Confirmed', 'Declined', 'No Response'));

ALTER TABLE public.engagement_trainers
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

COMMENT ON COLUMN public.engagement_trainers.status IS
  'Pending Invite = awaiting response; Confirmed = accepted; Declined = declined or admin-withdrawn; No Response = invitation expired unanswered, trainer released back to the pool (migration 031).';
COMMENT ON COLUMN public.engagement_trainers.released_at IS
  'When fn_release_unanswered_invites() set this row to No Response. Cleared on re-invite.';

-- ── 1b. All the skills a workshop was searched with ───────────
-- target_item_id kept only the FIRST skill, so a workshop reopened from the
-- Calendar's Invite button lost the rest. The app writes the latest search's
-- skills here on every round (radius too, in search_radius_km), and reopens
-- with them; NULL on older workshops = fall back to target_item_id.
ALTER TABLE public.training_engagements
  ADD COLUMN IF NOT EXISTS target_item_ids INTEGER[];

COMMENT ON COLUMN public.training_engagements.target_item_ids IS
  'Skill/subject item_ids of the latest recommendation search for this workshop (migration 031). NULL = older workshop, use target_item_id.';

-- ── 2. Double-booking guard: trainer rows ────────────────────
-- Fires when a trainer becomes Pending/Confirmed on a workshop (new invite,
-- re-invite of a No Response/Declined trainer, manual confirm of a released
-- one). Pending → Confirmed on the SAME row (the trainer accepting) is not
-- a new booking and is never re-checked.
CREATE OR REPLACE FUNCTION public.fn_guard_trainer_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_wf    TEXT;
  c       RECORD;
BEGIN
  IF NEW.status NOT IN ('Pending Invite', 'Confirmed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('Pending Invite', 'Confirmed')
     AND OLD.engagement_id = NEW.engagement_id
     AND OLD.trainer_id    = NEW.trainer_id THEN
    RETURN NEW;
  END IF;

  SELECT start_date, end_date, workflow_status INTO v_start, v_end, v_wf
  FROM training_engagements WHERE engagement_id = NEW.engagement_id;
  IF v_wf = 'Cancelled' OR v_start IS NULL OR v_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise bookings of the same trainer so two simultaneous invites
  -- cannot both pass the check below.
  PERFORM pg_advisory_xact_lock(hashtext('geoai-trainer-booking:' || NEW.trainer_id));

  SELECT te.engagement_id, te.training_title, te.start_date, te.end_date, et.status
    INTO c
  FROM engagement_trainers et
  JOIN training_engagements te ON te.engagement_id = et.engagement_id
  WHERE et.trainer_id     = NEW.trainer_id
    AND et.engagement_id <> NEW.engagement_id
    AND et.status IN ('Pending Invite', 'Confirmed')
    AND te.workflow_status <> 'Cancelled'
    AND te.start_date <= v_end
    AND te.end_date   >= v_start
  ORDER BY te.start_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',  -- exclusion_violation
      MESSAGE = format('TRAINER_DATE_CONFLICT: %s is already %s on "%s" (%s to %s)',
                       NEW.trainer_id, lower(c.status), COALESCE(c.training_title, 'another workshop'),
                       c.start_date, c.end_date),
      DETAIL  = json_build_object(
                  'trainer_id',     NEW.trainer_id,
                  'engagement_id',  c.engagement_id,
                  'training_title', c.training_title,
                  'start_date',     c.start_date,
                  'end_date',       c.end_date,
                  'status',         c.status)::TEXT;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_trainer_overlap ON public.engagement_trainers;
CREATE TRIGGER trg_guard_trainer_overlap
  BEFORE INSERT OR UPDATE OF status, engagement_id, trainer_id
  ON public.engagement_trainers
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_trainer_overlap();

-- ── 3. Double-booking guard: workshop date changes ───────────
-- A reschedule (or anything else that moves dates) must not drop an
-- active trainer onto dates they are already booked for elsewhere.
CREATE OR REPLACE FUNCTION public.fn_guard_engagement_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t         RECORD;
  c         RECORD;
  conflicts JSONB := '[]'::JSONB;
  names     TEXT  := '';
BEGIN
  IF NEW.workflow_status = 'Cancelled' OR NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
     AND OLD.workflow_status <> 'Cancelled' THEN
    RETURN NEW;
  END IF;

  FOR t IN
    SELECT et.trainer_id FROM engagement_trainers et
    WHERE et.engagement_id = NEW.engagement_id
      AND et.status IN ('Pending Invite', 'Confirmed')
    ORDER BY et.trainer_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('geoai-trainer-booking:' || t.trainer_id));

    SELECT te.engagement_id, te.training_title, te.start_date, te.end_date, et.status
      INTO c
    FROM engagement_trainers et
    JOIN training_engagements te ON te.engagement_id = et.engagement_id
    WHERE et.trainer_id     = t.trainer_id
      AND et.engagement_id <> NEW.engagement_id
      AND et.status IN ('Pending Invite', 'Confirmed')
      AND te.workflow_status <> 'Cancelled'
      AND te.start_date <= NEW.end_date
      AND te.end_date   >= NEW.start_date
    ORDER BY te.start_date
    LIMIT 1;

    IF FOUND THEN
      conflicts := conflicts || jsonb_build_object(
        'trainer_id',     t.trainer_id,
        'engagement_id',  c.engagement_id,
        'training_title', c.training_title,
        'start_date',     c.start_date,
        'end_date',       c.end_date,
        'status',         c.status);
      names := names || CASE WHEN names = '' THEN '' ELSE ', ' END
               || format('%s ("%s" %s to %s)', t.trainer_id, COALESCE(c.training_title, 'another workshop'),
                         c.start_date, c.end_date);
    END IF;
  END LOOP;

  IF jsonb_array_length(conflicts) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'TRAINER_DATE_CONFLICT: the new dates clash for ' || names,
      DETAIL  = conflicts::TEXT;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_engagement_dates ON public.training_engagements;
CREATE TRIGGER trg_guard_engagement_dates
  BEFORE UPDATE OF start_date, end_date, workflow_status
  ON public.training_engagements
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_engagement_dates();

-- ── 4. Who would be released right now (read-only) ───────────
-- Also the DRY RUN: SELECT * FROM fn_unanswered_invite_candidates();
-- "Expired" = no unused link still valid, OR the workshop's start date
-- (Sarawak time) has passed — a link never outlives its workshop.
CREATE OR REPLACE FUNCTION public.fn_unanswered_invite_candidates()
RETURNS TABLE (
  row_id           UUID,
  engagement_id    UUID,
  training_title   TEXT,
  start_date       DATE,
  end_date         DATE,
  created_by       UUID,
  trainer_id       TEXT,
  trainer_name     TEXT,
  invited_at       TIMESTAMPTZ,
  last_link_expiry TIMESTAMPTZ,
  reason           TEXT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    et.id,
    et.engagement_id,
    te.training_title,
    te.start_date,
    te.end_date,
    te.created_by,
    et.trainer_id,
    mt.trainer_name,
    et.invited_at,
    lt.last_expiry,
    CASE WHEN COALESCE(lt.has_live, FALSE) THEN 'workshop_started' ELSE 'link_expired' END
  FROM engagement_trainers et
  JOIN training_engagements te ON te.engagement_id = et.engagement_id
  LEFT JOIN master_trainers mt ON mt.trainer_id = et.trainer_id
  LEFT JOIN LATERAL (
    SELECT MAX(t.expires_at)                                AS last_expiry,
           BOOL_OR(t.used_at IS NULL AND t.expires_at > NOW()) AS has_live
    FROM invitation_tokens t
    WHERE t.engagement_id = et.engagement_id
      AND t.trainer_id    = et.trainer_id
  ) lt ON TRUE
  WHERE et.status = 'Pending Invite'
    AND te.workflow_status <> 'Cancelled'
    AND (
      NOT COALESCE(lt.has_live, FALSE)
      OR te.start_date < (NOW() AT TIME ZONE 'Asia/Kuching')::DATE
    )
  ORDER BY te.start_date, te.engagement_id, et.trainer_id;
$$;

-- ── 5. The release itself (run hourly by 031b) ───────────────
-- Returns the rows it released. Never sends email. Per workshop: status
-- recomputed (same rule as src/lib/engagementRollup.ts), one audit row
-- (actor NULL = system), and — unless p_notify is false — one bilingual
-- bell notification for the workshop's creator.
CREATE OR REPLACE FUNCTION public.fn_release_unanswered_invites(p_notify BOOLEAN DEFAULT TRUE)
RETURNS TABLE (
  engagement_id  UUID,
  training_title TEXT,
  trainer_id     TEXT,
  trainer_name   TEXT,
  reason         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ids UUID[];
  e     RECORD;
  n     INT;
  names TEXT;
  s_en  TEXT;
  s_bm  TEXT;
BEGIN
  SELECT array_agg(c.row_id) INTO v_ids FROM fn_unanswered_invite_candidates() c;
  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Snapshot BEFORE the update (afterwards they no longer match)
  CREATE TEMP TABLE IF NOT EXISTS _released ON COMMIT DROP AS
    SELECT * FROM fn_unanswered_invite_candidates() WITH NO DATA;
  TRUNCATE _released;
  INSERT INTO _released SELECT * FROM fn_unanswered_invite_candidates() c WHERE c.row_id = ANY(v_ids);

  UPDATE engagement_trainers et
     SET status = 'No Response', released_at = NOW()
   WHERE et.id = ANY(v_ids)
     AND et.status = 'Pending Invite';

  FOR e IN
    SELECT r.engagement_id, r.training_title, r.start_date, r.end_date, r.created_by,
           count(*)::INT AS n,
           string_agg(COALESCE(r.trainer_name, r.trainer_id) || ' (' || r.trainer_id || ')', ', '
                      ORDER BY r.trainer_id) AS names,
           jsonb_agg(jsonb_build_object(
             'trainer_id',       r.trainer_id,
             'trainer_name',     r.trainer_name,
             'invited_at',       r.invited_at,
             'last_link_expiry', r.last_link_expiry,
             'reason',           r.reason) ORDER BY r.trainer_id) AS trainers
    FROM _released r
    GROUP BY r.engagement_id, r.training_title, r.start_date, r.end_date, r.created_by
  LOOP
    UPDATE training_engagements te
       SET workflow_status = CASE
             WHEN s.conf >= te.trainers_needed THEN 'Confirmed'
             WHEN s.pend > 0                   THEN 'Pending Invite'
             ELSE 'Draft' END
      FROM (
        SELECT count(*) FILTER (WHERE x.status = 'Confirmed')      AS conf,
               count(*) FILTER (WHERE x.status = 'Pending Invite') AS pend
        FROM engagement_trainers x
        WHERE x.engagement_id = e.engagement_id
      ) s
     WHERE te.engagement_id = e.engagement_id
       AND te.workflow_status <> 'Cancelled';

    INSERT INTO audit_logs (actor, action, entity_type, entity_id, payload_json)
    VALUES (NULL, 'engagement.release_no_response', 'training_engagement', e.engagement_id::TEXT,
            jsonb_build_object('trainers', e.trainers, 'notified', p_notify AND e.created_by IS NOT NULL,
                               'actor_name', 'System (hourly release job)'));

    IF p_notify AND e.created_by IS NOT NULL THEN
      n := e.n;
      names := e.names;
      s_en := format('%s – %s', to_char(e.start_date, 'DD Mon YYYY'), to_char(e.end_date, 'DD Mon YYYY'));
      s_bm := s_en;
      INSERT INTO notifications (user_id, type, message_en, message_bm)
      VALUES (
        e.created_by,
        'trainer_no_response',
        format('%s released from "%s" (%s): %s did not respond before the invitation expired and %s back in the trainer pool. Note: no response was received from the trainer. You can re-invite or invite other trainers from the Calendar.',
               CASE WHEN n = 1 THEN '1 trainer' ELSE n || ' trainers' END,
               COALESCE(e.training_title, 'Workshop'), s_en, names,
               CASE WHEN n = 1 THEN 'is' ELSE 'are' END),
        format('%s jurulatih dilepaskan daripada "%s" (%s): %s tidak memberi maklum balas sebelum jemputan tamat tempoh dan kini kembali ke senarai jurulatih. Nota: tiada maklum balas diterima daripada jurulatih. Anda boleh menjemput semula atau menjemput jurulatih lain melalui Kalendar.',
               n, COALESCE(e.training_title, 'Bengkel'), s_bm, names)
      );
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT r.engagement_id, r.training_title, r.trainer_id, r.trainer_name, r.reason
    FROM _released r
    ORDER BY r.start_date, r.engagement_id, r.trainer_id;
END;
$$;

-- ── 6. Lexi's help articles (knowledge_base) ────────────────
-- Two seeded articles (migration 022) described the old rules: links
-- 'expire in 7 days', only ACCEPTED trainers locked, three statuses. Each
-- is updated ONLY if it still has the original seeded text, so an article
-- an admin has edited in the Database Console is left alone.
UPDATE public.knowledge_base
   SET content_en = $kb$After a Mode B search you select trainers and press "Finalize & Invite Selected". You review and edit one shared invitation email (personalised per trainer with merge fields) before anything is sent — nothing goes out without this human approval step. Each trainer receives secure, single-use Accept/Decline links that expire after 7 days, or at the end of the workshop's start day if that comes first. Responses update the workshop automatically and notify the coordinator in-app. A trainer who has been invited or has accepted is held only for that workshop's dates — they stay available for any other dates, and the system never books a trainer onto two overlapping workshops. If a trainer does not respond before the link expires, they are released automatically as "No Response" and the coordinator is notified; nothing is re-sent automatically. To invite more trainers, or re-invite someone, open the workshop in the Calendar and press "Invite trainers" — the search screen opens with that workshop's details and its available trainers already listed.$kb$,
       content_bm = $kb$Selepas carian Mod B, anda memilih jurulatih dan menekan "Muktamat & Jemput Yang Dipilih". Anda menyemak dan menyunting satu emel jemputan yang dikongsi (diperibadikan bagi setiap jurulatih dengan medan gabungan) sebelum apa-apa dihantar — tiada apa yang keluar tanpa langkah kelulusan manusia ini. Setiap jurulatih menerima pautan Terima/Tolak selamat, sekali guna, yang luput selepas 7 hari, atau pada akhir hari bengkel bermula jika lebih awal. Respons mengemas kini bengkel secara automatik dan memberitahu penyelaras dalam aplikasi. Jurulatih yang telah dijemput atau telah menerima hanya ditempah untuk tarikh bengkel tersebut — mereka kekal tersedia untuk tarikh lain, dan sistem tidak sekali-kali menempah seorang jurulatih untuk dua bengkel yang bertindih. Jika jurulatih tidak memberi maklum balas sebelum pautan luput, mereka dilepaskan secara automatik sebagai "Tiada Maklum Balas" dan penyelaras dimaklumkan; tiada apa-apa dihantar semula secara automatik. Untuk menjemput lebih ramai jurulatih, atau menjemput semula seseorang, buka bengkel dalam Kalendar dan tekan "Jemput jurulatih" — skrin carian dibuka dengan butiran bengkel tersebut dan jurulatih yang tersedia sudah tersenarai.$kb$,
       tags = ARRAY['invitation','jemputan','email','accept','decline','workflow','no response','tiada maklum balas','release','reinvite'],
       updated_at = NOW()
 WHERE title_en = $kb$Invitation workflow and trainer responses$kb$
   AND content_en = $kb$After a Mode B search you select trainers and press "Finalize & Invite Selected". You review and edit one shared invitation email (personalised per trainer with merge fields) before anything is sent — nothing goes out without this human approval step. Each trainer receives secure, single-use Accept/Decline links that expire in 7 days. Responses update the workshop automatically and notify the coordinator in-app. A trainer who accepted is locked out of overlapping searches for those dates.$kb$;
UPDATE public.knowledge_base
   SET content_en = $kb$A workshop's status rolls up from its trainer invitations. Draft: created, nothing sent yet. Pending Invite: at least one invitation is awaiting a response. Confirmed: enough trainers accepted (meets "trainers needed"). Declined: shown per-trainer when someone declines. Cancelled: the whole workshop was cancelled — its history is kept but it cannot be reopened. Per-trainer statuses are Pending Invite, Confirmed, Declined, or No Response (did not reply before the invitation expired and was released back to the trainer pool; can be re-invited). If released or declined trainers leave a workshop short, it goes back to Draft.$kb$,
       content_bm = $kb$Status bengkel dirumuskan daripada jemputan jurulatihnya. Draf: dicipta, belum ada yang dihantar. Menunggu Jemputan: sekurang-kurangnya satu jemputan menunggu respons. Disahkan: cukup jurulatih menerima (memenuhi "jurulatih diperlukan"). Ditolak: dipaparkan bagi setiap jurulatih yang menolak. Dibatalkan: seluruh bengkel dibatalkan — sejarahnya disimpan tetapi tidak boleh dibuka semula. Status bagi setiap jurulatih ialah Menunggu Jemputan, Disahkan, Ditolak, atau Tiada Maklum Balas (tidak membalas sebelum jemputan luput dan dilepaskan semula ke senarai jurulatih; boleh dijemput semula). Jika jurulatih yang dilepaskan atau menolak menyebabkan bengkel tidak cukup jurulatih, bengkel kembali ke Draf.$kb$,
       tags = ARRAY['status','draft','pending','confirmed','declined','cancelled','draf','disahkan','no response','tiada maklum balas'],
       updated_at = NOW()
 WHERE title_en = $kb$Workshop statuses explained$kb$
   AND content_en = $kb$A workshop's status rolls up from its trainer invitations. Draft: created, nothing sent yet. Pending Invite: at least one invitation is awaiting a response. Confirmed: enough trainers accepted (meets "trainers needed"). Declined: shown per-trainer when someone declines. Cancelled: the whole workshop was cancelled — its history is kept but it cannot be reopened. Per-trainer statuses are Pending Invite, Confirmed, or Declined.$kb$;

-- System-only: no app user (or the anon key) may call these directly.
REVOKE ALL ON FUNCTION public.fn_unanswered_invite_candidates()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_release_unanswered_invites(BOOLEAN)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_trainer_overlap()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_engagement_dates()                 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_unanswered_invite_candidates()        TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_release_unanswered_invites(BOOLEAN)   TO service_role;

NOTIFY pgrst, 'reload schema';
