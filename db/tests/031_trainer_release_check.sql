-- Self-check for migration 031 (release unanswered invites + no
-- double-booking). Run AFTER 031 (031b is NOT needed).
--
-- Creates two FAKE trainers (ZZTEST_A / ZZTEST_B) and fake workshops in
-- 2031 (plus one in 2020), checks every rule, then deliberately raises an
-- error at the end. The error is ON PURPOSE: it makes Postgres undo
-- everything this script did — including the release run in step 9 —
-- so NOTHING is left behind in the database.
--
-- Read the result in the error message:
--   "TEST RESULT: 16/16 checks passed …"  → all good
--   "TEST RESULT: n/16 … FAILED: …"       → send the message to Claude

DO $$
DECLARE
  uid    UUID;
  ok     INT := 0;
  failed TEXT := '';
  n      INT;
  s      TEXT;
  w1 UUID; w2 UUID; w3 UUID; w4 UUID; w5 UUID; w6 UUID; w7 UUID; w8 UUID;
BEGIN
  SELECT user_id INTO uid FROM profiles WHERE status = 'active' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'TEST SETUP: no active user found'; END IF;

  INSERT INTO master_trainers (trainer_id, trainer_name) VALUES
    ('ZZTEST_A', 'Test Trainer A'), ('ZZTEST_B', 'Test Trainer B');

  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by)
  VALUES ('ZZTEST W1', '2031-03-01', '2031-03-03', 'Pending Invite', uid) RETURNING engagement_id INTO w1;
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by)
  VALUES ('ZZTEST W2 overlaps W1', '2031-03-03', '2031-03-04', 'Draft', uid) RETURNING engagement_id INTO w2;
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by)
  VALUES ('ZZTEST W3 later', '2031-03-10', '2031-03-11', 'Draft', uid) RETURNING engagement_id INTO w3;
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by)
  VALUES ('ZZTEST W4 cancelled, overlaps W1', '2031-03-02', '2031-03-02', 'Cancelled', uid) RETURNING engagement_id INTO w4;

  INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES (w1, 'ZZTEST_A', 'Pending Invite');

  -- 1. Same trainer, overlapping workshop → refused
  BEGIN
    INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES (w2, 'ZZTEST_A', 'Pending Invite');
    failed := failed || ' [1 overlapping invite was accepted]';
  EXCEPTION WHEN exclusion_violation THEN ok := ok + 1;
  END;

  -- 2. Same trainer, non-overlapping workshop → allowed
  BEGIN
    INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES (w3, 'ZZTEST_A', 'Pending Invite');
    ok := ok + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ' [2 non-overlapping invite refused: ' || SQLERRM || ']';
  END;

  -- 3. A cancelled workshop never clashes
  BEGIN
    INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES (w4, 'ZZTEST_A', 'Confirmed');
    ok := ok + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ' [3 cancelled workshop clashed: ' || SQLERRM || ']';
  END;

  -- 4. A Declined row on overlapping dates is not a booking
  BEGIN
    INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES (w2, 'ZZTEST_A', 'Declined');
    ok := ok + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ' [4 declined row refused: ' || SQLERRM || ']';
  END;

  -- 5. …but re-inviting that Declined trainer while still booked on W1 → refused
  BEGIN
    UPDATE engagement_trainers SET status = 'Pending Invite' WHERE engagement_id = w2 AND trainer_id = 'ZZTEST_A';
    failed := failed || ' [5 re-invite onto clashing dates was accepted]';
  EXCEPTION WHEN exclusion_violation THEN ok := ok + 1;
  END;

  -- 6. The trainer accepting (Pending → Confirmed, same row) is never blocked
  BEGIN
    UPDATE engagement_trainers SET status = 'Confirmed' WHERE engagement_id = w1 AND trainer_id = 'ZZTEST_A';
    ok := ok + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ' [6 accept was blocked: ' || SQLERRM || ']';
  END;

  -- 7. Rescheduling W3 onto W1's dates (A is active on both) → refused
  BEGIN
    UPDATE training_engagements SET start_date = '2031-03-02', end_date = '2031-03-02' WHERE engagement_id = w3;
    failed := failed || ' [7 clashing reschedule was accepted]';
  EXCEPTION WHEN exclusion_violation THEN ok := ok + 1;
  END;

  -- 8. Rescheduling W3 to free dates → allowed
  BEGIN
    UPDATE training_engagements SET start_date = '2031-03-20', end_date = '2031-03-21' WHERE engagement_id = w3;
    ok := ok + 1;
  EXCEPTION WHEN OTHERS THEN failed := failed || ' [8 free reschedule refused: ' || SQLERRM || ']';
  END;

  -- Release scenario for trainer B
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by, trainers_needed)
  VALUES ('ZZTEST W5 expired link', '2031-05-01', '2031-05-02', 'Pending Invite', uid, 1) RETURNING engagement_id INTO w5;
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by, trainers_needed)
  VALUES ('ZZTEST W6 live link', '2031-06-01', '2031-06-01', 'Pending Invite', uid, 1) RETURNING engagement_id INTO w6;
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by, trainers_needed)
  VALUES ('ZZTEST W7 already started', '2020-01-01', '2020-01-02', 'Pending Invite', uid, 1) RETURNING engagement_id INTO w7;

  INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES
    (w5, 'ZZTEST_B', 'Pending Invite'), (w6, 'ZZTEST_B', 'Pending Invite'), (w7, 'ZZTEST_B', 'Pending Invite');
  INSERT INTO invitation_tokens (engagement_id, trainer_id, token_hash, action_scope, expires_at) VALUES
    (w5, 'ZZTEST_B', 'zztest-' || md5(random()::TEXT), 'accept', NOW() - INTERVAL '1 hour'),
    (w6, 'ZZTEST_B', 'zztest-' || md5(random()::TEXT), 'accept', NOW() + INTERVAL '3 days'),
    (w7, 'ZZTEST_B', 'zztest-' || md5(random()::TEXT), 'accept', NOW() + INTERVAL '3 days');

  -- 9. Dry run lists W5 (link expired) and W7 (workshop started), not W6
  SELECT string_agg(training_title || '=' || reason, ',' ORDER BY training_title) INTO s
  FROM fn_unanswered_invite_candidates() WHERE trainer_id = 'ZZTEST_B';
  IF s = 'ZZTEST W5 expired link=link_expired,ZZTEST W7 already started=workshop_started'
  THEN ok := ok + 1; ELSE failed := failed || format(' [9 candidates = %s]', s); END IF;

  PERFORM * FROM fn_release_unanswered_invites(TRUE);

  -- 10. W5 row is now No Response with released_at set
  SELECT status || '/' || (released_at IS NOT NULL) INTO s FROM engagement_trainers WHERE engagement_id = w5;
  IF s = 'No Response/true' THEN ok := ok + 1; ELSE failed := failed || format(' [10 W5 row = %s]', s); END IF;

  -- 11. W6 (live link) untouched
  SELECT status INTO s FROM engagement_trainers WHERE engagement_id = w6;
  IF s = 'Pending Invite' THEN ok := ok + 1; ELSE failed := failed || format(' [11 W6 row = %s]', s); END IF;

  -- 12. W5 workshop rolled back to Draft
  SELECT workflow_status INTO s FROM training_engagements WHERE engagement_id = w5;
  IF s = 'Draft' THEN ok := ok + 1; ELSE failed := failed || format(' [12 W5 workshop = %s]', s); END IF;

  -- 13. One bell notification + one audit row for W5
  SELECT count(*) INTO n FROM notifications
  WHERE user_id = uid AND type = 'trainer_no_response' AND message_en LIKE '%ZZTEST W5%';
  IF n = 1 THEN ok := ok + 1; ELSE failed := failed || format(' [13 W5 notifications = %s]', n); END IF;
  SELECT count(*) INTO n FROM audit_logs
  WHERE action = 'engagement.release_no_response' AND entity_id = w5::TEXT AND actor IS NULL;
  IF n = 1 THEN ok := ok + 1; ELSE failed := failed || format(' [14 W5 audit rows = %s]', n); END IF;

  -- 15. Released trainer can be re-invited; then a clashing invite is refused
  INSERT INTO training_engagements (training_title, start_date, end_date, workflow_status, created_by)
  VALUES ('ZZTEST W8 same dates as W5', '2031-05-02', '2031-05-02', 'Draft', uid) RETURNING engagement_id INTO w8;
  BEGIN
    UPDATE engagement_trainers SET status = 'Pending Invite', released_at = NULL
     WHERE engagement_id = w5 AND trainer_id = 'ZZTEST_B';
    BEGIN
      INSERT INTO engagement_trainers (engagement_id, trainer_id, status) VALUES (w8, 'ZZTEST_B', 'Pending Invite');
      failed := failed || ' [15 clash after re-invite was accepted]';
    EXCEPTION WHEN exclusion_violation THEN ok := ok + 1;
    END;
  EXCEPTION WHEN OTHERS THEN failed := failed || ' [15 re-invite of released trainer refused: ' || SQLERRM || ']';
  END;

  -- 16. Unknown statuses are still refused
  BEGIN
    UPDATE engagement_trainers SET status = 'Maybe' WHERE engagement_id = w6;
    failed := failed || ' [16 status Maybe was accepted]';
  EXCEPTION WHEN check_violation THEN ok := ok + 1;
  END;

  RAISE EXCEPTION 'TEST RESULT: %/16 checks passed%. (Shown as an error on purpose — all test data has been undone.)',
    ok, CASE WHEN failed = '' THEN '' ELSE ' — FAILED:' || failed END;
END $$;
