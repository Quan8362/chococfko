-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 6: ADMIN / OPERATIONS / ANTI-ABUSE FOUNDATION
-- ════════════════════════════════════════════════════════════════════════════════════
-- Operational tooling to run play-money poker safely. ADDITIVE + IDEMPOTENT + NON-DESTRUCTIVE.
-- Touches NO existing poker/TLMN/Caro/wallet data; only creates new poker_admin_*/poker_ops_*/
-- poker_incident_cases/poker_player_restrictions objects and new SECURITY DEFINER admin RPCs.
--
-- AUTHORIZATION MODEL: this project authorizes admins by email (ADMIN_EMAILS env), enforced in
-- the server-action layer via checkIsAdmin(). The DB has no "admin" role, so these RPCs are
-- service_role-only (the admin client) and take the acting admin's user id (p_actor) + a
-- mandatory reason explicitly. Each command writes its state change AND an immutable audit row
-- in the SAME transaction (atomic). All are idempotent where a repeat must not double-apply.
--
-- PRIVACY (security-model §2, SECURITY-HOLE-CARDS-001 — FROZEN): NONE of these objects store or
-- expose hole cards, the deck, the seed, password hashes, or auth tokens. The audit/incident/
-- ops `detail` jsonb is scrubbed in the app layer (lib/games/poker/admin.ts) before it ever
-- reaches here. Live private cards are NEVER exposed; the one card-revealing RPC works ONLY on
-- a terminal/frozen hand and writes a high-severity audit row.
--
-- Apply AFTER: poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine.
-- Rollback: migration_poker_admin_ops_rollback.sql (drops ONLY the objects created here).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Immutable admin audit log ──────────────────────────────────────────────────────
-- One row per administrative action. Append-only: a trigger blocks UPDATE/DELETE for EVERYONE
-- (including the service role), so evidence can never be silently altered or destroyed.
CREATE TABLE IF NOT EXISTS public.poker_admin_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor            uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- admin who acted
  actor_email      text,                       -- denormalized: survives a user delete
  action           text NOT NULL,              -- e.g. 'pause_table','refund_hand','restrict_player'
  table_id         uuid REFERENCES public.poker_tables(id) ON DELETE SET NULL,
  hand_id          uuid REFERENCES public.poker_hands(id)  ON DELETE SET NULL,
  target_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- player acted upon (if any)
  incident_case_id uuid,                        -- FK wired after poker_incident_cases exists
  reason           text NOT NULL,               -- mandatory free-text justification
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- before/after; NEVER cards/tokens/secrets
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_admin_audit_created_idx ON public.poker_admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS poker_admin_audit_table_idx   ON public.poker_admin_audit (table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_admin_audit_hand_idx    ON public.poker_admin_audit (hand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_admin_audit_case_idx    ON public.poker_admin_audit (incident_case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_admin_audit_target_idx  ON public.poker_admin_audit (target_user_id, created_at DESC);

-- Append-only guard. Raises on any UPDATE or DELETE so the audit trail is tamper-evident.
CREATE OR REPLACE FUNCTION public.poker_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'poker_admin_audit is append-only (% blocked)', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS trg_poker_admin_audit_immutable ON public.poker_admin_audit;
CREATE TRIGGER trg_poker_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON public.poker_admin_audit
  FOR EACH ROW EXECUTE FUNCTION public.poker_audit_immutable();

-- ── 2. Incident CASES (the OPEN→…→RESOLVED state machine) ──────────────────────────────
-- The existing poker_incidents table is the SYSTEM event log (pauses/refunds/reaper writes,
-- written by the engine RPCs). poker_incident_cases is the human CASE-MANAGEMENT layer with a
-- lifecycle; cases reference tables/hands/players + evidence, and accrue audit rows (notes).
CREATE TABLE IF NOT EXISTS public.poker_incident_cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status           text NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','REFUNDED','DISMISSED')),
  severity         text NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error','critical')),
  category         text NOT NULL DEFAULT 'other',  -- e.g. 'chip_dumping','frozen_hand','abuse','other'
  title            text NOT NULL,
  table_id         uuid REFERENCES public.poker_tables(id) ON DELETE SET NULL,
  hand_id          uuid REFERENCES public.poker_hands(id)  ON DELETE SET NULL,
  related_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  evidence         jsonb  NOT NULL DEFAULT '{}'::jsonb,  -- references/metrics ONLY, never cards
  resolution       text,                                  -- filled when terminal
  opened_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at        timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_incident_cases_status_idx ON public.poker_incident_cases (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS poker_incident_cases_table_idx  ON public.poker_incident_cases (table_id);

-- Now wire the audit → case FK (cases table now exists).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poker_admin_audit_case_fk') THEN
    ALTER TABLE public.poker_admin_audit
      ADD CONSTRAINT poker_admin_audit_case_fk
      FOREIGN KEY (incident_case_id) REFERENCES public.poker_incident_cases(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_poker_incident_cases_updated_at ON public.poker_incident_cases;
CREATE TRIGGER trg_poker_incident_cases_updated_at BEFORE UPDATE ON public.poker_incident_cases
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 3. Player restrictions (server-enforced, auditable, reversible) ────────────────────
CREATE TABLE IF NOT EXISTS public.poker_player_restrictions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('no_join','no_sit','full_ban')),
  reason           text NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  incident_case_id uuid REFERENCES public.poker_incident_cases(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  lifted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lifted_at        timestamptz
);
-- At most one ACTIVE restriction of a given kind per user.
CREATE UNIQUE INDEX IF NOT EXISTS poker_restrictions_active_uq
  ON public.poker_player_restrictions (user_id, kind) WHERE active;
CREATE INDEX IF NOT EXISTS poker_restrictions_user_idx
  ON public.poker_player_restrictions (user_id) WHERE active;

-- Is this user currently restricted from `p_kind` (or fully banned)? Honors expiry.
CREATE OR REPLACE FUNCTION public.poker_is_restricted(p_user_id uuid, p_kind text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.poker_player_restrictions
    WHERE user_id = p_user_id
      AND active
      AND (expires_at IS NULL OR expires_at > now())
      AND (kind = 'full_ban' OR kind = p_kind)
  );
$$;
REVOKE ALL ON FUNCTION public.poker_is_restricted(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_is_restricted(uuid, text) TO authenticated, service_role;

-- ── 4. Observability / structured monitoring events ───────────────────────────────────
-- A durable signal stream for ops dashboards & alerting. NEVER logs tokens, passwords, decks,
-- or hole cards (the app-layer recorder scrubs `detail` first).
CREATE TABLE IF NOT EXISTS public.poker_ops_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN (
               'failed_action','stale_state','duplicate_action','sequence_gap','reconnect_failure',
               'transaction_retry','settlement_failure','coin_conservation_failure','rls_denial',
               'frozen_hand','long_running_hand','abandoned_table','realtime_subscription_error')),
  severity   text NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error','critical')),
  table_id   uuid REFERENCES public.poker_tables(id) ON DELETE SET NULL,
  hand_id    uuid REFERENCES public.poker_hands(id)  ON DELETE SET NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_ops_events_kind_idx    ON public.poker_ops_events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_ops_events_created_idx  ON public.poker_ops_events (created_at DESC);
CREATE INDEX IF NOT EXISTS poker_ops_events_table_idx    ON public.poker_ops_events (table_id, created_at DESC);

-- ── 5. RLS — everything here is admin/audit only: opaque to clients (no policy) ────────
ALTER TABLE public.poker_admin_audit          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_incident_cases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_player_restrictions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_ops_events           ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy on any of them → anon/authenticated see nothing and can
-- write nothing. Only the service role (admin tooling / SECURITY DEFINER RPCs) touches them.
REVOKE ALL ON public.poker_admin_audit         FROM anon, authenticated;
REVOKE ALL ON public.poker_incident_cases      FROM anon, authenticated;
REVOKE ALL ON public.poker_player_restrictions FROM anon, authenticated;
REVOKE ALL ON public.poker_ops_events          FROM anon, authenticated;
-- These tables are deliberately NOT added to the supabase_realtime publication.

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 6. Internal: write an immutable audit row (called inside every admin RPC, same tx) ─
CREATE OR REPLACE FUNCTION public.poker_audit_write(
  p_actor      uuid,
  p_action     text,
  p_reason     text,
  p_table_id   uuid DEFAULT NULL,
  p_hand_id    uuid DEFAULT NULL,
  p_target     uuid DEFAULT NULL,
  p_case_id    uuid DEFAULT NULL,
  p_detail     jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_email text;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_actor;
  INSERT INTO public.poker_admin_audit
    (actor, actor_email, action, table_id, hand_id, target_user_id, incident_case_id, reason, detail)
  VALUES
    (p_actor, v_email, p_action, p_table_id, p_hand_id, p_target, p_case_id, btrim(p_reason),
     COALESCE(p_detail, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 7. Safe table commands (atomic state change + audit, idempotent) ───────────────────

-- Pause a table: marks it 'closing' is NOT what we want — pause must stop new hands while
-- leaving the table open. We model "paused" as a flag on the table. Add the column additively.
ALTER TABLE public.poker_tables
  ADD COLUMN IF NOT EXISTS paused          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_reason   text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.poker_admin_pause_table(
  p_actor uuid, p_table_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.poker_tables%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF t.paused THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'paused', true);
  END IF;
  UPDATE public.poker_tables
    SET paused = true, paused_reason = btrim(p_reason), state_version = state_version + 1
    WHERE id = p_table_id;
  PERFORM public.poker_audit_write(p_actor, 'pause_table', p_reason, p_table_id);
  RETURN jsonb_build_object('ok', true, 'paused', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.poker_admin_resume_table(
  p_actor uuid, p_table_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.poker_tables%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  -- Only safe to resume an OPEN table that is not closing/closed and has no frozen live hand.
  IF t.status <> 'open' THEN RAISE EXCEPTION 'table_not_open'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.poker_hands
    WHERE table_id = p_table_id AND phase = 'PAUSED_FOR_REVIEW'
  ) THEN
    RAISE EXCEPTION 'hand_frozen_for_review';
  END IF;
  IF NOT t.paused THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'paused', false);
  END IF;
  UPDATE public.poker_tables
    SET paused = false, paused_reason = NULL, state_version = state_version + 1
    WHERE id = p_table_id;
  PERFORM public.poker_audit_write(p_actor, 'resume_table', p_reason, p_table_id);
  RETURN jsonb_build_object('ok', true, 'paused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.poker_admin_mark_closing(
  p_actor uuid, p_table_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.poker_tables%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF t.status = 'closed' THEN RAISE EXCEPTION 'table_already_closed'; END IF;
  IF t.status = 'closing' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'closing');
  END IF;
  UPDATE public.poker_tables
    SET status = 'closing', state_version = state_version + 1 WHERE id = p_table_id;
  PERFORM public.poker_audit_write(p_actor, 'mark_closing', p_reason, p_table_id);
  RETURN jsonb_build_object('ok', true, 'status', 'closing');
END;
$$;

-- Close a table SAFELY: refuses if a live hand is still in progress (must be settled/refunded
-- first). Cashes out remaining seats via the existing safe stand-up path, then closes.
CREATE OR REPLACE FUNCTION public.poker_admin_close_table(
  p_actor uuid, p_table_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.poker_tables%ROWTYPE;
  v_live int;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF t.status = 'closed' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'closed');
  END IF;
  SELECT count(*) INTO v_live FROM public.poker_hands
    WHERE table_id = p_table_id
      AND phase NOT IN ('COMPLETED','CANCELLED');
  IF v_live > 0 THEN
    RAISE EXCEPTION 'live_hand_in_progress';  -- settle or refund the hand first
  END IF;
  -- Reuse the audited-safe close path (cashes out seats → wallets, marks closed).
  PERFORM public.poker_close_table(p_table_id);
  PERFORM public.poker_audit_write(p_actor, 'close_table', p_reason, p_table_id);
  RETURN jsonb_build_object('ok', true, 'status', 'closed');
END;
$$;

-- Force a seated player to sit out (no coin movement; takes effect immediately if not in a live
-- hand, otherwise queued like the normal sit-out path).
CREATE OR REPLACE FUNCTION public.poker_admin_force_sit_out(
  p_actor uuid, p_table_id uuid, p_seat_index int, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.poker_seats%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seat_not_found'; END IF;
  IF s.user_id IS NULL THEN RAISE EXCEPTION 'seat_empty'; END IF;
  IF s.status = 'sitting_out' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF public.poker_seat_in_live_hand(p_table_id, p_seat_index) THEN
    UPDATE public.poker_seats SET sit_out_next_hand = true
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
  ELSE
    UPDATE public.poker_seats SET status = 'sitting_out', sit_out_next_hand = false
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
  END IF;
  UPDATE public.poker_tables SET state_version = state_version + 1 WHERE id = p_table_id;
  PERFORM public.poker_audit_write(p_actor, 'force_sit_out', p_reason, p_table_id, NULL, s.user_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Freeze the live hand for review (reuses poker_pause_hand → PAUSED_FOR_REVIEW + system incident),
-- and additionally writes an admin-audit row tying it to the acting admin + reason.
CREATE OR REPLACE FUNCTION public.poker_admin_freeze_hand(
  p_actor uuid, p_hand_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.poker_hands%ROWTYPE; v_res jsonb;
BEGIN
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;
  v_res := public.poker_pause_hand(p_hand_id, COALESCE(p_reason, 'admin_freeze'));
  PERFORM public.poker_audit_write(p_actor, 'freeze_hand', p_reason, h.table_id, p_hand_id);
  RETURN v_res;
END;
$$;

-- Controlled refund workflow: refunds a (typically frozen) hand idempotently via the proven
-- poker_refund_hand RPC, then audits it. Returns the refund result. The refund itself is
-- idempotent (settlement lock) so a duplicated admin click never double-refunds.
CREATE OR REPLACE FUNCTION public.poker_admin_refund_hand(
  p_actor uuid, p_hand_id uuid, p_reason text, p_case_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.poker_hands%ROWTYPE; v_res jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;
  v_res := public.poker_refund_hand(p_hand_id);
  PERFORM public.poker_audit_write(p_actor, 'refund_hand', p_reason, h.table_id, p_hand_id, NULL, p_case_id,
                                   COALESCE(v_res, '{}'::jsonb));
  -- If the refund tied to a case, advance the case to REFUNDED.
  IF p_case_id IS NOT NULL THEN
    UPDATE public.poker_incident_cases
      SET status = 'REFUNDED', resolution = COALESCE(resolution, btrim(p_reason)),
          closed_by = p_actor, closed_at = now()
      WHERE id = p_case_id AND status NOT IN ('RESOLVED','REFUNDED','DISMISSED');
  END IF;
  RETURN v_res;
END;
$$;

-- ── 8. Restrict / lift a player ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.poker_admin_restrict_player(
  p_actor uuid, p_user_id uuid, p_kind text, p_reason text,
  p_expires_at timestamptz DEFAULT NULL, p_case_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_kind NOT IN ('no_join','no_sit','full_ban') THEN RAISE EXCEPTION 'bad_kind'; END IF;
  INSERT INTO public.poker_player_restrictions (user_id, kind, reason, incident_case_id, created_by, expires_at)
  VALUES (p_user_id, p_kind, btrim(p_reason), p_case_id, p_actor, p_expires_at)
  ON CONFLICT (user_id, kind) WHERE active DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);  -- already active
  END IF;
  PERFORM public.poker_audit_write(p_actor, 'restrict_player', p_reason, NULL, NULL, p_user_id, p_case_id,
                                   jsonb_build_object('kind', p_kind, 'expires_at', p_expires_at));
  RETURN jsonb_build_object('ok', true, 'restriction_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.poker_admin_lift_restriction(
  p_actor uuid, p_restriction_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.poker_player_restrictions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.poker_player_restrictions WHERE id = p_restriction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'restriction_not_found'; END IF;
  IF NOT r.active THEN RETURN jsonb_build_object('ok', true, 'idempotent', true); END IF;
  UPDATE public.poker_player_restrictions
    SET active = false, lifted_by = p_actor, lifted_at = now()
    WHERE id = p_restriction_id;
  PERFORM public.poker_audit_write(p_actor, 'lift_restriction', p_reason, NULL, NULL, r.user_id, r.incident_case_id,
                                   jsonb_build_object('kind', r.kind));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 9. Incident case management (open / note / transition) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.poker_admin_open_incident(
  p_actor uuid, p_title text, p_reason text,
  p_severity text DEFAULT 'warn', p_category text DEFAULT 'other',
  p_table_id uuid DEFAULT NULL, p_hand_id uuid DEFAULT NULL,
  p_related uuid[] DEFAULT '{}'::uuid[], p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN RAISE EXCEPTION 'title_required'; END IF;
  INSERT INTO public.poker_incident_cases
    (severity, category, title, table_id, hand_id, related_user_ids, evidence, opened_by)
  VALUES
    (COALESCE(p_severity,'warn'), COALESCE(p_category,'other'), btrim(p_title),
     p_table_id, p_hand_id, COALESCE(p_related,'{}'::uuid[]), COALESCE(p_evidence,'{}'::jsonb), p_actor)
  RETURNING id INTO v_id;
  PERFORM public.poker_audit_write(p_actor, 'open_incident', p_reason, p_table_id, p_hand_id, NULL, v_id);
  RETURN jsonb_build_object('ok', true, 'incident_case_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.poker_admin_add_incident_note(
  p_actor uuid, p_case_id uuid, p_note text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.poker_incident_cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.poker_incident_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM public.poker_audit_write(p_actor, 'incident_note', p_note, c.table_id, c.hand_id, NULL, p_case_id);
  UPDATE public.poker_incident_cases SET updated_at = now() WHERE id = p_case_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Transition an incident case. The allowed transitions are validated in the app layer
-- (lib/games/poker/admin.ts canTransitionIncident); the RPC enforces the terminal-resolution
-- contract: RESOLVED/DISMISSED require a resolution note. REFUNDED is reached only via
-- poker_admin_refund_hand (kept off this generic path so a refund always moves coins).
CREATE OR REPLACE FUNCTION public.poker_admin_transition_incident(
  p_actor uuid, p_case_id uuid, p_to_status text, p_reason text, p_resolution text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.poker_incident_cases%ROWTYPE; v_terminal boolean;
BEGIN
  SELECT * INTO c FROM public.poker_incident_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  IF p_to_status NOT IN ('OPEN','INVESTIGATING','RESOLVED','DISMISSED') THEN
    RAISE EXCEPTION 'bad_status';  -- REFUNDED only via poker_admin_refund_hand
  END IF;
  IF c.status IN ('RESOLVED','REFUNDED','DISMISSED') THEN
    RAISE EXCEPTION 'case_already_terminal';
  END IF;
  v_terminal := p_to_status IN ('RESOLVED','DISMISSED');
  IF v_terminal AND (p_resolution IS NULL OR length(btrim(p_resolution)) = 0) THEN
    RAISE EXCEPTION 'resolution_required';
  END IF;
  UPDATE public.poker_incident_cases
    SET status = p_to_status,
        resolution = CASE WHEN v_terminal THEN btrim(p_resolution) ELSE resolution END,
        closed_by  = CASE WHEN v_terminal THEN p_actor ELSE NULL END,
        closed_at  = CASE WHEN v_terminal THEN now() ELSE NULL END
    WHERE id = p_case_id;
  PERFORM public.poker_audit_write(p_actor, 'incident_transition', p_reason, c.table_id, c.hand_id, NULL, p_case_id,
                                   jsonb_build_object('from', c.status, 'to', p_to_status));
  RETURN jsonb_build_object('ok', true, 'status', p_to_status);
END;
$$;

-- ── 10. Audited reveal of hole cards — FROZEN/TERMINAL hands ONLY ──────────────────────
-- Live private cards are NEVER exposed. This works ONLY when the hand is no longer live
-- (COMPLETED / CANCELLED / PAUSED_FOR_REVIEW), and EVERY call writes a high-severity audit row.
-- Returns rows for the admin tooling (service role); never reaches any public/realtime path.
CREATE OR REPLACE FUNCTION public.poker_admin_reveal_hole_cards(
  p_actor uuid, p_hand_id uuid, p_reason text, p_case_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.poker_hands%ROWTYPE; v_cards jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;
  IF h.phase NOT IN ('COMPLETED','CANCELLED','PAUSED_FOR_REVIEW') THEN
    RAISE EXCEPTION 'hand_still_live';  -- never expose cards in a live hand
  END IF;
  SELECT jsonb_agg(jsonb_build_object('seatIndex', seat_index, 'userId', user_id, 'cards', cards)
                   ORDER BY seat_index)
    INTO v_cards
    FROM public.poker_hole_cards WHERE hand_id = p_hand_id;
  -- The audit row records THAT cards were revealed (+ who/why) but NOT the card values.
  PERFORM public.poker_audit_write(p_actor, 'reveal_hole_cards', p_reason, h.table_id, p_hand_id, NULL, p_case_id,
                                   jsonb_build_object('phase', h.phase));
  RETURN jsonb_build_object('ok', true, 'hole', COALESCE(v_cards, '[]'::jsonb));
END;
$$;

-- ── 11. Observability recorder (service role) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.poker_record_ops_event(
  p_kind text, p_severity text, p_table_id uuid, p_hand_id uuid, p_user_id uuid, p_detail jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.poker_ops_events (kind, severity, table_id, hand_id, user_id, detail)
  VALUES (p_kind, COALESCE(p_severity,'warn'), p_table_id, p_hand_id, p_user_id, COALESCE(p_detail,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 12. Grants — service role ONLY (the admin client). The browser never reaches these. ─
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'poker_audit_write(uuid, text, text, uuid, uuid, uuid, uuid, jsonb)',
    'poker_admin_pause_table(uuid, uuid, text)',
    'poker_admin_resume_table(uuid, uuid, text)',
    'poker_admin_mark_closing(uuid, uuid, text)',
    'poker_admin_close_table(uuid, uuid, text)',
    'poker_admin_force_sit_out(uuid, uuid, int, text)',
    'poker_admin_freeze_hand(uuid, uuid, text)',
    'poker_admin_refund_hand(uuid, uuid, text, uuid)',
    'poker_admin_restrict_player(uuid, uuid, text, text, timestamptz, uuid)',
    'poker_admin_lift_restriction(uuid, uuid, text)',
    'poker_admin_open_incident(uuid, text, text, text, text, uuid, uuid, uuid[], jsonb)',
    'poker_admin_add_incident_note(uuid, uuid, text)',
    'poker_admin_transition_incident(uuid, uuid, text, text, text)',
    'poker_admin_reveal_hole_cards(uuid, uuid, text, uuid)',
    'poker_record_ops_event(text, text, uuid, uuid, uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
