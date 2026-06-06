-- Phase 5: Caro leaderboard view
-- Run in Supabase SQL Editor

CREATE OR REPLACE VIEW caro_tournament_leaderboard AS
WITH participant_stats AS (
  SELECT
    p.user_id,
    COUNT(DISTINCT p.tournament_id)                                                      AS tournaments_played,
    COUNT(CASE WHEN t.champion_user_id = p.user_id AND t.status = 'finished' THEN 1 END) AS championships
  FROM caro_tournament_participants p
  JOIN caro_tournaments t ON t.id = p.tournament_id
  WHERE p.status NOT IN ('withdrawn')
  GROUP BY p.user_id
),
match_stats AS (
  SELECT user_id,
    SUM(wins)   AS wins,
    SUM(losses) AS losses,
    SUM(draws)  AS draws
  FROM (
    SELECT player_x_id AS user_id,
      COUNT(CASE WHEN winner_user_id = player_x_id THEN 1 END)                        AS wins,
      COUNT(CASE WHEN loser_user_id  = player_x_id THEN 1 END)                        AS losses,
      COUNT(CASE WHEN winner_user_id IS NULL AND status = 'finished' THEN 1 END)      AS draws
    FROM caro_tournament_matches
    WHERE player_x_id IS NOT NULL AND status IN ('finished', 'walkover')
    GROUP BY player_x_id
    UNION ALL
    SELECT player_o_id AS user_id,
      COUNT(CASE WHEN winner_user_id = player_o_id THEN 1 END)                        AS wins,
      COUNT(CASE WHEN loser_user_id  = player_o_id THEN 1 END)                        AS losses,
      COUNT(CASE WHEN winner_user_id IS NULL AND status = 'finished' THEN 1 END)      AS draws
    FROM caro_tournament_matches
    WHERE player_o_id IS NOT NULL AND status IN ('finished', 'walkover')
    GROUP BY player_o_id
  ) subq
  GROUP BY user_id
)
SELECT
  ps.user_id,
  ps.tournaments_played,
  ps.championships,
  COALESCE(ms.wins,   0)                                           AS wins,
  COALESCE(ms.losses, 0)                                           AS losses,
  COALESCE(ms.draws,  0)                                           AS draws,
  COALESCE(ms.wins, 0) + COALESCE(ms.losses, 0) + COALESCE(ms.draws, 0) AS matches_played,
  CASE
    WHEN COALESCE(ms.wins, 0) + COALESCE(ms.losses, 0) + COALESCE(ms.draws, 0) > 0
    THEN ROUND(
      COALESCE(ms.wins, 0)::numeric
      / (COALESCE(ms.wins, 0) + COALESCE(ms.losses, 0) + COALESCE(ms.draws, 0))
      * 100, 1
    )
    ELSE 0
  END AS win_rate
FROM participant_stats ps
LEFT JOIN match_stats ms ON ms.user_id = ps.user_id;
