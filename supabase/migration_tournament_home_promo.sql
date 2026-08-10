-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_home_promo.sql  (additive — applies AFTER migration_tournament_core.sql)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ADMIN-CONTROLLED HOME PROMO flag for tournaments.
--
-- Adds a single boolean to public.tournaments: `home_promo_enabled`. When TRUE (and the tournament
-- is otherwise public + ongoing/upcoming), it is eligible to appear in the animated activity-promo
-- strip on the site home page. A tournament is NEVER auto-promoted just because it is live/soon —
-- a Site Admin must explicitly opt it in.
--
-- Security / visibility:
--   • The column lives on public.tournaments, whose existing RLS (tournaments_public_select) already
--     exposes published/completed rows (all columns) to anon. So the public promo query reads this
--     flag through the SAME anon, RLS-gated path — no service-role, no widened visibility. A boolean
--     "should this appear on the home page" carries no sensitive data.
--   • WRITES are unchanged: only the service-role client (inside a Site-Admin-guarded server action)
--     may UPDATE it — the tournaments_service_all policy + the REVOKE of INSERT/UPDATE/DELETE from
--     anon/authenticated in core still hold. This migration adds NO new policy or grant.
--
-- Additive & safe by default:
--   • DEFAULT false + NOT NULL → every existing tournament stays NON-promoted after this runs. No
--     tournament becomes promoted automatically; production shows no promo until an Admin turns it on.
--   • Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS home_promo_enabled boolean NOT NULL DEFAULT false;

-- Small partial index: the promo query scans only the handful of rows an Admin has opted in. The
-- table is tiny, so this is cleanliness/future-proofing more than a hot-path necessity.
CREATE INDEX IF NOT EXISTS tournaments_home_promo_idx
  ON public.tournaments (home_promo_enabled)
  WHERE home_promo_enabled;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_home_promo.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
