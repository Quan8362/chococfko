-- ════════════════════════════════════════════════════════════════════════════════════════════
-- tournament_rule_engine_tests.sql — Prompt 15A-2 (rule presets + event rule snapshots)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Verifies the rule-engine persistence layer:
--   • preset (key,version) uniqueness + non-empty payload CHECK;
--   • snapshot event FK + one-snapshot-per-event uniqueness;
--   • snapshot independence from the preset (a preset UPDATE never changes an existing snapshot);
--   • FJP preset is NOT default and carries the requires-configuration handicap blocker;
--   • RLS/grants: anon + authenticated(non-admin) cannot read OR write either base table; the safe
--     summary RPC exposes only a minimal public-safe projection, only for published/completed events;
--     draft/archived never leak; cross-event access is blocked; service-role reads/writes fully.
--
-- Self-contained: BEGIN … ROLLBACK, persists nothing. Setup as superuser (RESET ROLE); RLS/permission
-- sections via SET LOCAL ROLE. Run against Supabase LOCAL only, AFTER all tournament migrations
-- (core 1 … public_privacy 7 … rule_engine 8) have been applied.
--
-- Migration idempotency (#16), rollback→reapply→retest (#17) and the migration-1–7 regression (#18)
-- are exercised by the LOCAL DATABASE GATE procedure (docs runbook §"Rule engine — local gate"),
-- since they require re-running whole migration files (not possible inside one transaction).
-- ════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- Make the harness order-independent: if the FJP preset (or any test key) is already committed (e.g.
-- seed_tournament_rule_presets.sql was run first), remove it INSIDE this transaction so the fixtures
-- below insert cleanly. The whole transaction ROLLBACKs, so committed seed data is untouched afterwards.
DELETE FROM public.tournament_rule_presets
  WHERE preset_key IN ('fjp_olympiad_2026', 'empty_preset', 'obj_preset', 'would_be_default', 'hack');

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────────────
-- One PUBLISHED and one DRAFT tournament, each with a round-robin event.
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 're-published', 'RE Published', 'published'),
  ('a3333333-3333-3333-3333-333333333333', 're-draft',     'RE Draft',     'draft');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('e1000000-0000-0000-0000-0000000000a0', 'a1111111-1111-1111-1111-111111111111', 'RR-pub', 'round_robin', 1),
  ('e3000000-0000-0000-0000-0000000000d0', 'a3333333-3333-3333-3333-333333333333', 'RR-draft', 'round_robin', 1);

-- A preset (FJP-shaped standard variant) for provenance + summary assertions.
INSERT INTO public.tournament_rule_presets
  (id, preset_key, version, label, schema_version, is_default, requires_configuration, status, payload)
VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'fjp_olympiad_2026', 1, 'FJP Olympiad 2026', 1, false, true, 'active',
  '[{"category":"standard","rules":{
      "group":{"match":{"games_to_win":1,"max_games":1,"points_to_win":21,"win_by":1,"points_cap":null,"allow_tied_game":false},
               "win_table_points":1,"loss_table_points":0,
               "tie_break_order":["table_points","point_difference","points_for","organizer_decision"]},
      "knockout":{"match":{"games_to_win":1,"max_games":1,"points_to_win":21,"win_by":2,"points_cap":31,"allow_tied_game":false}},
      "handicap":{"enabled":true,"mode":"starting_score","entries":[],"requires_configuration":true}}}]'::jsonb
);

-- The deep-copied RuleSet payload used for the published event's snapshot (standard variant rules).
-- Independent of the preset row (no shared reference / no FK).
INSERT INTO public.tournament_event_rule_snapshots
  (id, event_id, source, preset_key, preset_version, category, schema_version, snapshot_version, requires_configuration, payload)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-0000000000a0', 'preset', 'fjp_olympiad_2026', 1, 'standard', 1, 1, true,
  '{"group":{"match":{"games_to_win":1,"max_games":1,"points_to_win":21,"win_by":1,"points_cap":null,"allow_tied_game":false},
             "win_table_points":1,"loss_table_points":0,
             "tie_break_order":["table_points","point_difference","points_for","organizer_decision"]},
    "knockout":{"match":{"games_to_win":1,"max_games":1,"points_to_win":21,"win_by":2,"points_cap":31,"allow_tied_game":false}},
    "handicap":{"enabled":true,"mode":"starting_score","entries":[],"requires_configuration":true}}'::jsonb
);

-- Draft event snapshot (custom) — must never leak to Guests via the RPC.
INSERT INTO public.tournament_event_rule_snapshots
  (id, event_id, source, category, schema_version, snapshot_version, requires_configuration, payload)
VALUES (
  'c0000000-0000-0000-0000-000000000002',
  'e3000000-0000-0000-0000-0000000000d0', 'custom', NULL, 1, 1, false,
  '{"group":{"match":{"games_to_win":1,"max_games":1,"points_to_win":15,"win_by":1,"points_cap":null,"allow_tied_game":false},
             "win_table_points":1,"loss_table_points":0,"tie_break_order":["table_points","point_difference"]},
    "knockout":{"match":{"games_to_win":1,"max_games":1,"points_to_win":21,"win_by":2,"points_cap":31,"allow_tied_game":false}},
    "handicap":{"enabled":false,"mode":"starting_score","entries":[],"requires_configuration":false}}'::jsonb
);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SCHEMA / CONSTRAINT ASSERTIONS (superuser)
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_ver int; v_reqcfg boolean; v_default boolean; v_entries jsonb; v_payload jsonb;
BEGIN
  -- (1) Preset (key, version) is unique.
  BEGIN
    INSERT INTO public.tournament_rule_presets (preset_key, version, label, payload)
    VALUES ('fjp_olympiad_2026', 1, 'dup', '[{"category":"x","rules":{}}]'::jsonb);
    RAISE EXCEPTION 'T1: duplicate (preset_key,version) was allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- (2) Preset payload must be a non-empty array.
  BEGIN
    INSERT INTO public.tournament_rule_presets (preset_key, version, label, payload)
    VALUES ('empty_preset', 1, 'empty', '[]'::jsonb);
    RAISE EXCEPTION 'T2a: empty-array payload was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_rule_presets (preset_key, version, label, payload)
    VALUES ('obj_preset', 1, 'obj', '{}'::jsonb);
    RAISE EXCEPTION 'T2b: non-array payload was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (3) Snapshot event_id must reference an existing event.
  BEGIN
    INSERT INTO public.tournament_event_rule_snapshots (event_id, source, payload)
    VALUES ('e9999999-9999-9999-9999-999999999999', 'custom',
            '{"group":{},"knockout":{},"handicap":{}}'::jsonb);
    RAISE EXCEPTION 'T3: snapshot with a bogus event_id was allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- (4) At most one snapshot per event.
  BEGIN
    INSERT INTO public.tournament_event_rule_snapshots (event_id, source, payload)
    VALUES ('e1000000-0000-0000-0000-0000000000a0', 'custom',
            '{"group":{},"knockout":{},"handicap":{}}'::jsonb);
    RAISE EXCEPTION 'T4: a second snapshot for the same event was allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- provenance CHECK: a preset snapshot without provenance is rejected; a custom one with provenance is rejected.
  BEGIN
    INSERT INTO public.tournament_event_rule_snapshots (event_id, source, payload)
    VALUES ('e3000000-0000-0000-0000-0000000000d0', 'preset',
            '{"group":{},"knockout":{},"handicap":{}}'::jsonb);  -- source=preset but no preset_key/version
    RAISE EXCEPTION 'T4b: preset snapshot without provenance was allowed';
  EXCEPTION WHEN check_violation THEN NULL; WHEN unique_violation THEN NULL; END;

  -- (6) FJP preset is NOT the global default.
  SELECT is_default INTO v_default FROM public.tournament_rule_presets
    WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;
  IF v_default IS DISTINCT FROM false THEN RAISE EXCEPTION 'T6: FJP preset is marked default'; END IF;

  -- (7) FJP preset requires configuration (handicap numbers missing) and its handicap has no entries.
  SELECT requires_configuration INTO v_reqcfg FROM public.tournament_rule_presets
    WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;
  IF v_reqcfg IS DISTINCT FROM true THEN RAISE EXCEPTION 'T7: FJP preset not flagged requires_configuration'; END IF;
  SELECT (payload -> 0 -> 'rules' -> 'handicap' -> 'entries') INTO v_entries
    FROM public.tournament_rule_presets WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;
  IF v_entries IS NULL OR jsonb_array_length(v_entries) <> 0 THEN
    RAISE EXCEPTION 'T7b: FJP preset handicap already carries entries (must be empty until configured)';
  END IF;

  -- is_default CHECK pins false: an attempt to seed a default preset is rejected.
  BEGIN
    INSERT INTO public.tournament_rule_presets (preset_key, version, label, is_default, payload)
    VALUES ('would_be_default', 1, 'nope', true, '[{"category":"x","rules":{}}]'::jsonb);
    RAISE EXCEPTION 'T7c: a default preset was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (5) A preset UPDATE must NOT change an existing snapshot (independence: no shared ref / no FK).
  -- Run LAST: this mutation intentionally rewrites the FJP preset payload, so it must come after the
  -- FJP read-assertions (T6/T7) above. The snapshot must stay pinned to its deep-copied rules.
  SELECT payload INTO v_payload FROM public.tournament_event_rule_snapshots
    WHERE id = 'c0000000-0000-0000-0000-000000000001';
  UPDATE public.tournament_rule_presets
    SET payload = '[{"category":"standard","rules":{"group":{"match":{"points_to_win":9999}}}}]'::jsonb
    WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;
  IF (SELECT payload FROM public.tournament_event_rule_snapshots WHERE id = 'c0000000-0000-0000-0000-000000000001')
       IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'T5: snapshot payload changed when the preset was updated';
  END IF;
  IF (SELECT (payload #>> '{group,match,points_to_win}')::int
        FROM public.tournament_event_rule_snapshots WHERE id = 'c0000000-0000-0000-0000-000000000001') <> 21 THEN
    RAISE EXCEPTION 'T5b: snapshot no longer reads points_to_win = 21 after preset edit';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ANON (Guest): no base-table read/write; safe RPC only; draft never leaks; cross-event blocked.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE n int; r record;
BEGIN
  -- (13) Anon cannot read the preset base table.
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_rule_presets;
    RAISE EXCEPTION 'T13a: anon can SELECT tournament_rule_presets (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- (13) Anon cannot read the snapshot base table (no internal metadata over REST/Realtime).
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_event_rule_snapshots;
    RAISE EXCEPTION 'T13b: anon can SELECT tournament_event_rule_snapshots (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- (8) Anon cannot write a preset.
  BEGIN
    INSERT INTO public.tournament_rule_presets (preset_key, version, label, payload)
    VALUES ('hack', 1, 'hack', '[{"category":"x","rules":{}}]'::jsonb);
    RAISE EXCEPTION 'T8: anon could INSERT a preset';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- (9) Anon cannot write a snapshot.
  BEGIN
    INSERT INTO public.tournament_event_rule_snapshots (event_id, source, payload)
    VALUES ('e1000000-0000-0000-0000-0000000000a0', 'custom', '{"group":{},"knockout":{},"handicap":{}}'::jsonb);
    RAISE EXCEPTION 'T9: anon could INSERT a snapshot';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- (11) Published event: the safe summary RPC returns exactly one row with the public-safe projection.
  SELECT count(*) INTO n FROM public.tournament_public_event_rule_summary('e1000000-0000-0000-0000-0000000000a0');
  IF n <> 1 THEN RAISE EXCEPTION 'T11a: anon cannot read published event rule summary (n=%)', n; END IF;

  SELECT * INTO r FROM public.tournament_public_event_rule_summary('e1000000-0000-0000-0000-0000000000a0') LIMIT 1;
  IF r.group_points_to_win <> 21 OR r.group_win_by <> 1 OR r.group_points_cap IS NOT NULL THEN
    RAISE EXCEPTION 'T11b: group summary wrong (pts=%, win_by=%, cap=%)', r.group_points_to_win, r.group_win_by, r.group_points_cap;
  END IF;
  IF r.knockout_points_to_win <> 21 OR r.knockout_win_by <> 2 OR r.knockout_points_cap <> 31 THEN
    RAISE EXCEPTION 'T11c: knockout summary wrong (pts=%, win_by=%, cap=%)', r.knockout_points_to_win, r.knockout_win_by, r.knockout_points_cap;
  END IF;
  IF r.handicap_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'T11d: handicap_enabled not surfaced'; END IF;
  IF r.category <> 'standard' OR r.preset_label <> 'FJP Olympiad 2026' THEN
    RAISE EXCEPTION 'T11e: category/label wrong (cat=%, label=%)', r.category, r.preset_label;
  END IF;
  IF r.tie_break_order IS NULL OR jsonb_array_length(r.tie_break_order) <> 4 THEN
    RAISE EXCEPTION 'T11f: tie_break_order not surfaced';
  END IF;

  -- (12) Draft event: the RPC returns nothing (visibility gate).
  SELECT count(*) INTO n FROM public.tournament_public_event_rule_summary('e3000000-0000-0000-0000-0000000000d0');
  IF n <> 0 THEN RAISE EXCEPTION 'T12: draft event rule summary leaked to anon (n=%)', n; END IF;

  -- (13) Structural: the RPC's RETURNS TABLE signature exposes only the safe projection. Naming an
  -- internal column (e.g. requires_configuration / preset_version / version) on its result is a
  -- compile error, and T13a/b prove the base tables are unreadable. Nothing further to assert.

  -- (15) Cross-event: requesting a DIFFERENT event id returns only that event's data — the published
  -- event's summary never bleeds into a draft/unknown event query.
  SELECT count(*) INTO n FROM public.tournament_public_event_rule_summary('e9999999-9999-9999-9999-999999999999');
  IF n <> 0 THEN RAISE EXCEPTION 'T15: unknown event id returned rows (n=%)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED (signed-in, non-admin): still no base-table read/write.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  -- (10) Non-admin cannot read or write either base table.
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_rule_presets;
    RAISE EXCEPTION 'T10a: authenticated can SELECT presets (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_event_rule_snapshots;
    RAISE EXCEPTION 'T10b: authenticated can SELECT snapshots (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_event_rule_snapshots (event_id, source, payload)
    VALUES ('e1000000-0000-0000-0000-0000000000a0', 'custom', '{"group":{},"knockout":{},"handicap":{}}'::jsonb);
    RAISE EXCEPTION 'T10c: authenticated could INSERT a snapshot';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- The same safe RPC is available and still gated by event visibility.
  SELECT count(*) INTO n FROM public.tournament_public_event_rule_summary('e1000000-0000-0000-0000-0000000000a0');
  IF n <> 1 THEN RAISE EXCEPTION 'T10d: authenticated cannot read published summary via RPC (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_public_event_rule_summary('e3000000-0000-0000-0000-0000000000d0');
  IF n <> 0 THEN RAISE EXCEPTION 'T10e: draft summary leaked to authenticated (n=%)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SERVICE ROLE (admin backend): full read/write.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE service_role;
DO $$
DECLARE n int;
BEGIN
  -- (14) Service-role reads both base tables fully.
  SELECT count(*) INTO n FROM public.tournament_rule_presets;
  IF n < 1 THEN RAISE EXCEPTION 'T14a: service-role cannot read presets'; END IF;
  SELECT count(*) INTO n FROM public.tournament_event_rule_snapshots;
  IF n < 2 THEN RAISE EXCEPTION 'T14b: service-role cannot read all snapshots (n=%)', n; END IF;

  -- (14) Service-role writes a snapshot (for a fresh event with no snapshot yet).
  INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count)
  VALUES ('e2000000-0000-0000-0000-0000000000b0', 'a1111111-1111-1111-1111-111111111111', 'RR2', 'round_robin', 1);
  INSERT INTO public.tournament_event_rule_snapshots (event_id, source, payload)
  VALUES ('e2000000-0000-0000-0000-0000000000b0', 'default',
          '{"group":{"match":{"points_to_win":21}},"knockout":{"match":{"points_to_win":21}},"handicap":{"enabled":false}}'::jsonb);
  SELECT count(*) INTO n FROM public.tournament_event_rule_snapshots
    WHERE event_id = 'e2000000-0000-0000-0000-0000000000b0';
  IF n <> 1 THEN RAISE EXCEPTION 'T14c: service-role could not INSERT a snapshot'; END IF;

  -- (14) UPDATE bumps the optimistic-concurrency version via the trigger.
  UPDATE public.tournament_event_rule_snapshots
    SET snapshot_version = snapshot_version + 1
    WHERE event_id = 'e2000000-0000-0000-0000-0000000000b0';
  IF (SELECT version FROM public.tournament_event_rule_snapshots
        WHERE event_id = 'e2000000-0000-0000-0000-0000000000b0') <> 2 THEN
    RAISE EXCEPTION 'T14d: version was not bumped on UPDATE';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- GRANTS / FUNCTION SHAPE (superuser)
-- ════════════════════════════════════════════════════════════════════════════════════════════
RESET ROLE;
DO $$
BEGIN
  -- anon/authenticated have NO table privilege on either base table.
  IF has_table_privilege('anon', 'public.tournament_rule_presets', 'SELECT') THEN
    RAISE EXCEPTION 'G1: anon has SELECT on tournament_rule_presets'; END IF;
  IF has_table_privilege('authenticated', 'public.tournament_event_rule_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'G2: authenticated has SELECT on tournament_event_rule_snapshots'; END IF;
  IF has_table_privilege('anon', 'public.tournament_event_rule_snapshots', 'INSERT') THEN
    RAISE EXCEPTION 'G3: anon has INSERT on tournament_event_rule_snapshots'; END IF;

  -- The safe RPC is executable by anon + authenticated + service_role.
  IF NOT has_function_privilege('anon', 'public.tournament_public_event_rule_summary(uuid)', 'execute') THEN
    RAISE EXCEPTION 'G4: anon cannot execute the safe summary RPC'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.tournament_public_event_rule_summary(uuid)', 'execute') THEN
    RAISE EXCEPTION 'G4b: authenticated cannot execute the safe summary RPC'; END IF;

  -- The safe RPC is SECURITY DEFINER with a pinned search_path.
  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'tournament_public_event_rule_summary'
      AND p.prosecdef = true
      AND array_to_string(coalesce(p.proconfig, '{}'), ',') LIKE '%search_path=public, pg_temp%';
  IF NOT FOUND THEN RAISE EXCEPTION 'G5: safe RPC is not SECURITY DEFINER with pinned search_path'; END IF;

  -- Both base tables have RLS enabled.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tournament_rule_presets'::regclass) THEN
    RAISE EXCEPTION 'G6: RLS not enabled on tournament_rule_presets'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tournament_event_rule_snapshots'::regclass) THEN
    RAISE EXCEPTION 'G7: RLS not enabled on tournament_event_rule_snapshots'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'tournament_rule_engine_tests: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
