-- ════════════════════════════════════════════════════════════════════════════════════════════
-- seed_tournament_rule_presets.sql  (Prompt 15A-2 — idempotent preset seed; NO real tournaments)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Seeds the FJP OLYMPIAD 2026 rule preset (key `fjp_olympiad_2026`, version 1) so an admin can pick
-- it when creating an event. This is the DATABASE mirror of buildFjpOlympiad2026Preset() in
-- lib/tournaments/rules/presets.ts — the TypeScript domain remains the authoritative shape.
--
-- Idempotent: ON CONFLICT (preset_key, version) DO UPDATE refreshes the row in place, so re-running
-- is safe and never duplicates. It seeds ONLY the preset template — no tournament, event, competitor,
-- or snapshot rows are created here.
--
-- HANDICAP BLOCKER (do not "fix" by inventing numbers): FJP intends a gender handicap, but the
-- concrete values are NOT yet confirmed by the organizer. The preset therefore ships with
-- requires_configuration = true and handicap.entries = []. Applying it to live scoring returns the
-- typed HANDICAP_NOT_CONFIGURED error (see lib/tournaments/rules/handicap.ts). It must not be seeded
-- with guessed handicap values.
--
-- Run AFTER migration_tournament_rule_engine.sql. As a template row it is public-invisible (admin/
-- service-role only) — Guests only ever see a per-event scoring summary via the safe RPC.

INSERT INTO public.tournament_rule_presets
  (preset_key, version, label, description, schema_version, is_default, requires_configuration, status, payload)
VALUES (
  'fjp_olympiad_2026',
  1,
  'FJP Olympiad 2026',
  'FJP Olympiad 2026 badminton preset. Beginner: group play touch-15 (win by 1); Standard: group '
    || 'play touch-21 (win by 1). Both categories: knockout touch-21, win by 2, deuce cap 31. '
    || 'Standings: table points (win 1 / loss 0) → point difference → points for → organizer decision. '
    || 'Gender handicap is enabled but NOT yet configured (requires organizer numbers).',
  1,
  false,   -- never the global default
  true,    -- handicap numbers still pending → requires configuration
  'active',
  $json$[
    {
      "category": "beginner",
      "rules": {
        "group": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 15, "win_by": 1, "points_cap": null, "allow_tied_game": false },
          "win_table_points": 1,
          "loss_table_points": 0,
          "tie_break_order": ["table_points", "point_difference", "points_for", "organizer_decision"]
        },
        "knockout": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 21, "win_by": 2, "points_cap": 31, "allow_tied_game": false }
        },
        "handicap": { "enabled": true, "mode": "starting_score", "entries": [], "requires_configuration": true }
      }
    },
    {
      "category": "standard",
      "rules": {
        "group": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 21, "win_by": 1, "points_cap": null, "allow_tied_game": false },
          "win_table_points": 1,
          "loss_table_points": 0,
          "tie_break_order": ["table_points", "point_difference", "points_for", "organizer_decision"]
        },
        "knockout": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 21, "win_by": 2, "points_cap": 31, "allow_tied_game": false }
        },
        "handicap": { "enabled": true, "mode": "starting_score", "entries": [], "requires_configuration": true }
      }
    }
  ]$json$::jsonb
)
ON CONFLICT (preset_key, version) DO UPDATE SET
  label                  = EXCLUDED.label,
  description            = EXCLUDED.description,
  schema_version         = EXCLUDED.schema_version,
  is_default             = EXCLUDED.is_default,
  requires_configuration = EXCLUDED.requires_configuration,
  status                 = EXCLUDED.status,
  payload                = EXCLUDED.payload,
  updated_at             = now();

NOTIFY pgrst, 'reload schema';
