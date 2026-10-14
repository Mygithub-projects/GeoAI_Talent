-- Self-check for migration 030 (trainer engagement limit). Run AFTER 030.
--
-- Creates two FAKE trainers (ZZTEST_A / ZZTEST_B) and fake workshops in
-- 2030–2032, checks every counting rule, then deliberately raises an error
-- at the end. The error is ON PURPOSE: it makes Postgres undo everything
-- this script inserted, so NOTHING is left behind in the database.
--
-- Read the result in the error message:
--   "TEST RESULT: 11/11 checks passed …"  → all good
--   "TEST RESULT: n/11 … FAILED: …"       → send the message to Claude

DO $$
DECLARE
  uid     UUID;
  ok      INT := 0;
  failed  TEXT := '';
  n       INT;
  c       INT;
  p       INT;
  first_t TEXT;
  e       UUID[] := ARRAY[]::UUID[];
  new_id  UUID;
  i       INT;
  -- (start, end, workshop status, trainer status) for ZZTEST_A
  ws      TEXT[][] := ARRAY[
    ARRAY['2031-03-01','2031-03-02','Confirmed',     'Confirmed'],      -- 1 counts
    ARRAY['2031-05-10','2031-05-12','Confirmed',     'Confirmed'],      -- 2 counts once (3 days)
    ARRAY['2031-06-01','2031-06-01','Cancelled',     'Confirmed'],      -- 3 cancelled → no
    ARRAY['2031-07-01','2031-07-01','Pending Invite','Pending Invite'], -- 4 pending
    ARRAY['2031-08-01','2031-08-01','Pending Invite','Declined'],       -- 5 declined → no
    ARRAY['2030-12-31','2030-12-31','Confirmed',     'Confirmed'],      -- 6 counts in 2030 only
    ARRAY['2032-01-01','2032-01-01','Confirmed',     'Confirmed'],      -- 7 counts in 2032 only
    ARRAY['2031-12-31','2032-01-02','Confirmed',     'Confirmed']       -- 8 counts in 2031 (start date)
  ];
BEGIN
  SELECT user_id INTO uid FROM profiles WHERE status = 'active' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'TEST SETUP: no active user found'; END IF;

  INSERT INTO master_trainers (trainer_id, trainer_name) VALUES
    ('ZZTEST_A', 'Test Trainer A'), ('ZZTEST_B', 'Test Trainer B');

  FOR i IN 1 .. array_length(ws, 1) LOOP
    INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status)
    VALUES ('ZZTEST workshop ' || i, ws[i][1]::DATE, ws[i][2]::DATE, ws[i][3])
    RETURNING engagement_id INTO new_id;
    e := e || new_id;
    INSERT INTO engagement_trainers (engagement_id, trainer_id, status)
    VALUES (new_id, 'ZZTEST_A', ws[i][4]);
  END LOOP;

  -- 1. Without a signed-in active user the functions return nothing
  SELECT count(*) INTO n FROM fn_trainer_engagement_summary(ARRAY['ZZTEST_A'], 2031);
  IF n = 0 THEN ok := ok + 1; ELSE failed := failed || ' [1 no-user returned rows]'; END IF;

  -- act as an active user from here on
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::TEXT, true);

  -- 2–3. 2031: confirmed = #1, #2, #8 → 3 ; pending = #4 → 1
  SELECT confirmed_count, pending_count INTO c, p
    FROM fn_trainer_engagement_summary(ARRAY['ZZTEST_A'], 2031);
  IF c = 3 THEN ok := ok + 1; ELSE failed := failed || format(' [2 confirmed 2031 = %s, want 3]', c); END IF;
  IF p = 1 THEN ok := ok + 1; ELSE failed := failed || format(' [3 pending 2031 = %s, want 1]', p); END IF;

  -- 4. Year boundary: 2030 has only #6
  SELECT confirmed_count INTO c FROM fn_trainer_engagement_summary(ARRAY['ZZTEST_A'], 2030);
  IF c = 1 THEN ok := ok + 1; ELSE failed := failed || format(' [4 confirmed 2030 = %s, want 1]', c); END IF;

  -- 5. Year boundary: 2032 has only #7 (#8 starts in 2031)
  SELECT confirmed_count INTO c FROM fn_trainer_engagement_summary(ARRAY['ZZTEST_A'], 2032);
  IF c = 1 THEN ok := ok + 1; ELSE failed := failed || format(' [5 confirmed 2032 = %s, want 1]', c); END IF;

  -- 6. The workshop being staffed is excluded (#1 → 2 left)
  SELECT confirmed_count INTO c FROM fn_trainer_engagement_summary(ARRAY['ZZTEST_A'], 2031, e[1]);
  IF c = 2 THEN ok := ok + 1; ELSE failed := failed || format(' [6 excluding #1 = %s, want 2]', c); END IF;

  -- 7. A trainer with no workshops returns no row (the app shows 0)
  SELECT count(*) INTO n FROM fn_trainer_engagement_summary(ARRAY['ZZTEST_B'], 2031);
  IF n = 0 THEN ok := ok + 1; ELSE failed := failed || ' [7 trainer B returned a row]'; END IF;

  -- 8–9. History 2031: #1, #2, #4, #8 (no cancelled/declined), newest first
  SELECT count(*) INTO n FROM fn_trainer_engagement_history('ZZTEST_A', 2031);
  IF n = 4 THEN ok := ok + 1; ELSE failed := failed || format(' [8 history rows = %s, want 4]', n); END IF;
  SELECT training_title INTO first_t FROM fn_trainer_engagement_history('ZZTEST_A', 2031) LIMIT 1;
  IF first_t = 'ZZTEST workshop 8' THEN ok := ok + 1; ELSE failed := failed || format(' [9 first row = %s]', first_t); END IF;

  -- 10. The limit setting exists and is 21
  SELECT value_int INTO c FROM app_settings WHERE setting_key = 'trainer_max_engagements_per_year';
  IF c = 21 THEN ok := ok + 1; ELSE failed := failed || format(' [10 limit = %s, want 21]', c); END IF;

  -- 11. The database refuses a limit of 0
  BEGIN
    UPDATE app_settings SET value_int = 0 WHERE setting_key = 'trainer_max_engagements_per_year';
    failed := failed || ' [11 limit 0 was accepted]';
  EXCEPTION WHEN check_violation THEN
    ok := ok + 1;
  END;

  RAISE EXCEPTION 'TEST RESULT: %/11 checks passed%. (Shown as an error on purpose — all test data has been undone.)',
    ok, CASE WHEN failed = '' THEN '' ELSE ' — FAILED:' || failed END;
END $$;
