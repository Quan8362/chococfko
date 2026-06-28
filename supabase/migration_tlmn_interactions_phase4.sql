-- TLMN interaction system — Phase 4: player reporting + moderation + analytics.
-- Apply AFTER migration_tlmn_interactions_phase3.sql.
--
-- DESIGN NOTES:
--   • Per-player MUTE is a client-only privacy preference (it only changes what the muting
--     user sees), so it is stored in localStorage — NOT here (spec §17: "only add tables
--     that are actually necessary"). This migration adds only the reports table.
--   • Reports: a user may file a report (RLS insert-own) and read only their own; admins
--     read/update all via the service role. recent_event_data holds only interaction KEYS +
--     seats (no private account data, no chat) so moderation context never leaks PII.
--   • Analytics reuse the existing game_interaction_usage (Phase 3) + reports here; a couple
--     of admin-only aggregate VIEWs are provided. No per-message logging beyond what Phase 3
--     already persists (phrases stay transient ⇒ no content is stored).

-- ── 1. Reports table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_interaction_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  room_id           uuid,
  reason            text NOT NULL CHECK (reason IN ('spam','harassment','offensive','cheating','other')),
  recent_event_data jsonb,           -- interaction keys/seats only — never PII or chat
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed','actioned')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- light anti-spam: one report row per reporter→reported per ~minute is enforced in the RPC
  CONSTRAINT gir_not_self CHECK (reporter_user_id <> reported_user_id)
);
CREATE INDEX IF NOT EXISTS gir_status_idx ON public.game_interaction_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS gir_reported_idx ON public.game_interaction_reports (reported_user_id, created_at DESC);

-- ── 2. RLS ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.game_interaction_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gir_read_own" ON public.game_interaction_reports;
CREATE POLICY "gir_read_own" ON public.game_interaction_reports
  FOR SELECT TO authenticated USING (reporter_user_id = auth.uid());

DROP POLICY IF EXISTS "gir_insert_own" ON public.game_interaction_reports;
CREATE POLICY "gir_insert_own" ON public.game_interaction_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_user_id = auth.uid());
-- No client UPDATE/DELETE policy: moderation status changes happen via the service role.

-- ── 3. report_player RPC (SECURITY DEFINER) ────────────────────────────────────────────
-- Files a report as the caller. Rate-limited (max 1 per reporter→reported per 60s) so it
-- can't be weaponised. recent_event is a trimmed jsonb (keys/seats only). Returns { ok }.
CREATE OR REPLACE FUNCTION public.report_player(
  p_reported_user_id uuid,
  p_room_id          uuid,
  p_reason           text,
  p_recent_event     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_reported_user_id IS NULL OR p_reported_user_id = v_uid THEN RAISE EXCEPTION 'invalid_target'; END IF;
  IF p_reason NOT IN ('spam','harassment','offensive','cheating','other') THEN RAISE EXCEPTION 'invalid_reason'; END IF;

  -- Rate limit: ignore a duplicate report of the same player within 60s (idempotent-ish).
  IF EXISTS (
    SELECT 1 FROM public.game_interaction_reports
    WHERE reporter_user_id = v_uid AND reported_user_id = p_reported_user_id
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'deduped', true);
  END IF;

  INSERT INTO public.game_interaction_reports
    (reporter_user_id, reported_user_id, room_id, reason, recent_event_data)
    VALUES (v_uid, p_reported_user_id, p_room_id, p_reason, p_recent_event);

  RETURN jsonb_build_object('ok', true, 'deduped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.report_player(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_player(uuid, uuid, text, jsonb) TO authenticated;

-- ── 4. Admin analytics VIEWs (read via service role in /admin) ─────────────────────────
-- Aggregate item usage (count + coin spend) and report counts. No PII, no message content.
CREATE OR REPLACE VIEW public.tlmn_interaction_item_stats AS
  SELECT interaction_key,
         count(*)                              AS uses,
         count(*) FILTER (WHERE was_free)      AS free_uses,
         count(*) FILTER (WHERE NOT was_free)  AS paid_uses,
         COALESCE(sum(coin_cost), 0)           AS coins_spent,
         count(DISTINCT user_id)               AS unique_senders
  FROM public.game_interaction_usage
  GROUP BY interaction_key;

CREATE OR REPLACE VIEW public.tlmn_interaction_report_stats AS
  SELECT reason, status, count(*) AS n
  FROM public.game_interaction_reports
  GROUP BY reason, status;

-- Views inherit the caller's privileges; admin reads them through the service role only.
REVOKE ALL ON public.tlmn_interaction_item_stats   FROM anon, authenticated;
REVOKE ALL ON public.tlmn_interaction_report_stats FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
