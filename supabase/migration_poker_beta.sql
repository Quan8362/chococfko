-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — CLOSED BETA  (terms acknowledgement + optional per-cohort persistence)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Additive, idempotent, non-destructive. No existing table is altered. Apply any time
-- after migration_poker_core.sql. The app DEGRADES SAFELY if this is not yet applied:
-- getBetaTermsAck() catches the missing-relation error (42P01) and reports the terms as
-- not-yet-acknowledged; under an ACTIVE closed beta that fails closed (a tester cannot sit
-- until they accept terms), which is why applying this migration is a cohort-entry gate.
--
-- Cohort membership + suspension are managed via ENV allowlists (see lib/games/poker/beta.ts:
-- POKER_BETA_COHORT_* and POKER_BETA_SUSPENDED) — NOT in this table — so ops can add/remove a
-- tester without a DB write, mirroring ADMIN_EMAILS / POKER_ALPHA_TESTERS. This migration only
-- persists the one thing that MUST survive a deploy: each tester's terms acknowledgement.
--
-- 🔴 No coins move in this migration. No gameplay table is touched.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.poker_beta_acknowledgements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which terms version the tester accepted. Bumping BETA_TERMS_VERSION in code re-prompts.
  terms_version  int  NOT NULL CHECK (terms_version >= 1),
  -- The cohort the tester was in at acknowledgement time (audit only; env is authoritative).
  cohort         text CHECK (cohort IS NULL OR cohort IN
                   ('internal_admin','technical','experienced','new_players','community')),
  -- Non-sensitive acknowledgement context (locale, device class). NEVER stores tokens/cards.
  acknowledged_locale text CHECK (acknowledged_locale IS NULL OR char_length(acknowledged_locale) <= 12),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- One row per (user, terms_version): a repeat acknowledgement is an idempotent no-op.
  UNIQUE (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS poker_beta_ack_user_idx
  ON public.poker_beta_acknowledgements (user_id, terms_version DESC);

ALTER TABLE public.poker_beta_acknowledgements ENABLE ROW LEVEL SECURITY;

-- A tester may read back ONLY their own acknowledgement (so the client can skip re-prompting).
-- Writes go through the service-role server action (acknowledgePokerBetaTerms), so no INSERT
-- policy is granted to authenticated — the write path stays single, validated & audited.
DROP POLICY IF EXISTS poker_beta_ack_read_own ON public.poker_beta_acknowledgements;
CREATE POLICY poker_beta_ack_read_own ON public.poker_beta_acknowledgements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.poker_beta_acknowledgements FROM anon;
GRANT SELECT ON public.poker_beta_acknowledgements TO authenticated;
