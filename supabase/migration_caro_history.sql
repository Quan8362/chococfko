-- ── CARO GAME HISTORY VIEW ────────────────────────────────────────────────────
-- Run in Supabase SQL Editor after migration_caro.sql

CREATE OR REPLACE VIEW caro_games_history AS
SELECT
  r.id,
  r.room_code,
  r.winner,
  r.status,
  r.created_at,
  r.finished_at,
  r.player_x,
  r.player_o,
  COALESCE(
    nullif(trim(px.display_name), ''),
    nullif(trim(ux.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(ux.raw_user_meta_data->>'name'), ''),
    split_part(ux.email, '@', 1),
    'Người chơi X'
  ) AS player_x_name,
  COALESCE(
    nullif(trim(po.display_name), ''),
    nullif(trim(uo.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(uo.raw_user_meta_data->>'name'), ''),
    split_part(uo.email, '@', 1),
    'Người chơi O'
  ) AS player_o_name
FROM caro_rooms r
LEFT JOIN profiles  px ON px.id = r.player_x
LEFT JOIN profiles  po ON po.id = r.player_o
LEFT JOIN auth.users ux ON ux.id = r.player_x
LEFT JOIN auth.users uo ON uo.id = r.player_o
WHERE r.status IN ('finished', 'cancelled')
ORDER BY r.finished_at DESC NULLS LAST;

NOTIFY pgrst, 'reload schema';
