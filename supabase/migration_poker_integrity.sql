-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 7: INTEGRITY / ANTI-COLLUSION REVIEW FOUNDATION
-- ════════════════════════════════════════════════════════════════════════════════════
-- The persistence layer for the risk-review workflow (lib/games/poker/integrity/*). ADDITIVE +
-- IDEMPOTENT + NON-DESTRUCTIVE. Creates ONLY new poker_risk_* objects and SECURITY DEFINER RPCs.
-- Touches NO existing poker / TLMN / Caro / wallet data. Moves NO coins — the integrity path is
-- deliberately kept separate from wallet logic (a case never calls a coin RPC).
--
-- WHAT THIS STORES (evidence for a HUMAN reviewer — never automatic punishment):
--   • poker_risk_cases        — the review queue (versioned score + status lifecycle)
--   • poker_risk_signals      — the contributing signal snapshot per case (redacted evidence)
--   • poker_risk_case_events  — immutable case timeline (status changes, notes, admin actions)
--
-- PRIVACY (see docs/poker/integrity/privacy.md): NO raw device/network identifiers, hole cards,
-- decks, or seeds are ever stored here. Identity correlation happens on HASHED tokens in the app
-- (lib/games/poker/integrity/privacy.ts); only signal codes + numeric evidence reach the DB. The
-- app scrubs `evidence`/`detail` (redactPii) before it arrives.
--
-- AUTHORIZATION: mirrors migration_poker_admin_ops — no DB "admin" role; these RPCs are
-- service_role-only, take the acting admin's user id (p_actor) + a mandatory reason, and write an
-- immutable poker_admin_audit row in the SAME transaction. FSM transitions mirror review.ts.
--
-- Apply AFTER: poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine →
--              poker_admin_ops (this migration reuses poker_admin_audit + poker_audit_write).
-- Rollback: migration_poker_integrity_rollback.sql (drops ONLY the objects created here).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Review queue: risk cases ────────────────────────────────────────────────────────
-- One row per scored subject (a user or an account pair). `dedup_key` is version-scoped so the
-- scoring job UPSERTs a case rather than creating duplicates; a weights-version bump opens a fresh
-- comparable case. Score fields are recomputable; status/notes/resolution are human-owned.
CREATE TABLE IF NOT EXISTS public.poker_risk_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key         text NOT NULL UNIQUE,          -- riskCaseDedupKey(): weightsVersion + sorted subject
  status            text NOT NULL DEFAULT 'NEW'
                      CHECK (status IN ('NEW','TRIAGED','INVESTIGATING','MONITORING','ACTION_REQUIRED','DISMISSED','RESOLVED')),
  score             int  NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  score_version     text NOT NULL,
  weights_version   text NOT NULL,
  confidence        numeric(4,3) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  band              text NOT NULL DEFAULT 'none' CHECK (band IN ('none','low','medium','high')),
  subject_user_ids  uuid[] NOT NULL DEFAULT '{}'::uuid[],  -- canonical (sorted) subject
  related_user_ids  uuid[] NOT NULL DEFAULT '{}'::uuid[],
  related_hand_ids  uuid[] NOT NULL DEFAULT '{}'::uuid[],
  value_transferred bigint NOT NULL DEFAULT 0,      -- advisory magnitude only; NOT a coin movement
  window_from       timestamptz,
  window_to         timestamptz,
  signal_summary    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- redacted; never cards/PII
  notes             text,
  resolution        text,                            -- filled when terminal
  opened_at         timestamptz NOT NULL DEFAULT now(),
  last_scored_at    timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  closed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at         timestamptz,
  incident_case_id  uuid REFERENCES public.poker_incident_cases(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS poker_risk_cases_status_idx ON public.poker_risk_cases (status, score DESC);
CREATE INDEX IF NOT EXISTS poker_risk_cases_band_idx   ON public.poker_risk_cases (band, last_scored_at DESC);
CREATE INDEX IF NOT EXISTS poker_risk_cases_subject_idx ON public.poker_risk_cases USING gin (subject_user_ids);

DROP TRIGGER IF EXISTS trg_poker_risk_cases_updated_at ON public.poker_risk_cases;
CREATE TRIGGER trg_poker_risk_cases_updated_at BEFORE UPDATE ON public.poker_risk_cases
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 2. Contributing signal snapshot (append-only per scoring run) ──────────────────────
CREATE TABLE IF NOT EXISTS public.poker_risk_signals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES public.poker_risk_cases(id) ON DELETE CASCADE,
  code             text NOT NULL,                    -- RiskSignalCode
  category         text NOT NULL CHECK (category IN ('relationship','gameplay','account_session')),
  severity         numeric(4,3) NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 1),
  confidence       numeric(4,3) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  contribution     int NOT NULL DEFAULT 0,           -- points added to the score (display)
  related_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  related_hand_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  window_hands     int NOT NULL DEFAULT 0,
  reasons          text[] NOT NULL DEFAULT '{}'::text[],
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- redacted numeric evidence ONLY
  scored_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_risk_signals_case_idx ON public.poker_risk_signals (case_id, scored_at DESC);

-- ── 3. Immutable case timeline (status changes, notes, admin actions) ──────────────────
CREATE TABLE IF NOT EXISTS public.poker_risk_case_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES public.poker_risk_cases(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('status_change','note','action','rescore')),
  from_status    text,
  to_status      text,
  action         text,                               -- ReviewActionKind (when kind='action')
  reason         text,
  evidence_ref   text,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email    text,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- redacted; never cards/PII/coins
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_risk_case_events_case_idx ON public.poker_risk_case_events (case_id, created_at DESC);

-- Append-only guard: block UPDATE/DELETE for everyone (tamper-evident timeline).
CREATE OR REPLACE FUNCTION public.poker_risk_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'poker_risk_case_events is append-only (% blocked)', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS trg_poker_risk_events_immutable ON public.poker_risk_case_events;
CREATE TRIGGER trg_poker_risk_events_immutable
  BEFORE UPDATE OR DELETE ON public.poker_risk_case_events
  FOR EACH ROW EXECUTE FUNCTION public.poker_risk_events_immutable();

-- ── 4. RLS — admin/audit only: opaque to clients (no policy) ───────────────────────────
ALTER TABLE public.poker_risk_cases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_risk_signals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_risk_case_events ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy → anon/authenticated see nothing and can write nothing.
-- Only the service role (admin tooling / SECURITY DEFINER RPCs) touches these tables. Detection
-- logic is never exposed to players.
REVOKE ALL ON public.poker_risk_cases       FROM anon, authenticated;
REVOKE ALL ON public.poker_risk_signals     FROM anon, authenticated;
REVOKE ALL ON public.poker_risk_case_events FROM anon, authenticated;
-- Deliberately NOT added to the supabase_realtime publication.

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 5. RPCs (service role; SECURITY DEFINER; NO coin movement) ─────────────────────────

-- Upsert a risk case from a scoring run. Idempotent on dedup_key: an existing case has ONLY its
-- score fields refreshed (status / notes / resolution stay human-owned). Replaces the signal
-- snapshot for the case. Never touches wallets.
CREATE OR REPLACE FUNCTION public.poker_risk_upsert_case(
  p_dedup_key        text,
  p_score            int,
  p_score_version    text,
  p_weights_version  text,
  p_confidence       numeric,
  p_band             text,
  p_subject_user_ids uuid[],
  p_related_user_ids uuid[] DEFAULT '{}'::uuid[],
  p_related_hand_ids uuid[] DEFAULT '{}'::uuid[],
  p_value_transferred bigint DEFAULT 0,
  p_window_from      timestamptz DEFAULT NULL,
  p_window_to        timestamptz DEFAULT NULL,
  p_signal_summary   jsonb DEFAULT '{}'::jsonb,
  p_signals          jsonb DEFAULT '[]'::jsonb          -- [{code,category,severity,confidence,contribution,reasons,evidence,relatedUserIds,relatedHandIds,windowHands}]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_created boolean := false;
  sig jsonb;
BEGIN
  IF p_dedup_key IS NULL OR length(btrim(p_dedup_key)) = 0 THEN RAISE EXCEPTION 'dedup_key_required'; END IF;

  SELECT id INTO v_id FROM public.poker_risk_cases WHERE dedup_key = p_dedup_key FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.poker_risk_cases
      (dedup_key, score, score_version, weights_version, confidence, band, subject_user_ids,
       related_user_ids, related_hand_ids, value_transferred, window_from, window_to, signal_summary,
       last_scored_at)
    VALUES
      (p_dedup_key, p_score, p_score_version, p_weights_version, COALESCE(p_confidence,0), p_band,
       COALESCE(p_subject_user_ids,'{}'::uuid[]), COALESCE(p_related_user_ids,'{}'::uuid[]),
       COALESCE(p_related_hand_ids,'{}'::uuid[]), COALESCE(p_value_transferred,0),
       p_window_from, p_window_to, COALESCE(p_signal_summary,'{}'::jsonb), now())
    RETURNING id INTO v_id;
    v_created := true;
  ELSE
    -- Refresh only the recomputable fields. Do NOT touch status/notes/resolution/closed_*.
    UPDATE public.poker_risk_cases
      SET score = p_score, score_version = p_score_version, weights_version = p_weights_version,
          confidence = COALESCE(p_confidence,0), band = p_band,
          related_user_ids = COALESCE(p_related_user_ids,'{}'::uuid[]),
          related_hand_ids = COALESCE(p_related_hand_ids,'{}'::uuid[]),
          value_transferred = COALESCE(p_value_transferred,0),
          window_from = p_window_from, window_to = p_window_to,
          signal_summary = COALESCE(p_signal_summary,'{}'::jsonb), last_scored_at = now()
      WHERE id = v_id;
  END IF;

  -- Replace the signal snapshot with the latest run.
  DELETE FROM public.poker_risk_signals WHERE case_id = v_id;
  IF p_signals IS NOT NULL AND jsonb_typeof(p_signals) = 'array' THEN
    FOR sig IN SELECT * FROM jsonb_array_elements(p_signals) LOOP
      INSERT INTO public.poker_risk_signals
        (case_id, code, category, severity, confidence, contribution, related_user_ids,
         related_hand_ids, window_hands, reasons, evidence)
      VALUES (
        v_id,
        sig->>'code',
        COALESCE(sig->>'category','gameplay'),
        COALESCE((sig->>'severity')::numeric, 0),
        COALESCE((sig->>'confidence')::numeric, 0),
        COALESCE((sig->>'contribution')::int, 0),
        COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(sig->'relatedUserIds','[]'::jsonb)) x), '{}'::uuid[]),
        COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(sig->'relatedHandIds','[]'::jsonb)) x), '{}'::uuid[]),
        COALESCE((sig->>'windowHands')::int, 0),
        COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(sig->'reasons','[]'::jsonb)) x), '{}'::text[]),
        COALESCE(sig->'evidence','{}'::jsonb)
      );
    END LOOP;
  END IF;

  IF NOT v_created THEN
    INSERT INTO public.poker_risk_case_events (case_id, kind, detail)
    VALUES (v_id, 'rescore', jsonb_build_object('score', p_score, 'band', p_band));
  END IF;

  RETURN jsonb_build_object('ok', true, 'case_id', v_id, 'created', v_created);
END;
$$;

-- Transition a case status. Mirrors review.ts canTransitionReview + terminal-resolution contract.
CREATE OR REPLACE FUNCTION public.poker_risk_transition_case(
  p_actor uuid, p_case_id uuid, p_to_status text, p_reason text, p_resolution text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.poker_risk_cases%ROWTYPE;
  v_allowed text[];
  v_terminal boolean;
  v_email text;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO c FROM public.poker_risk_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
  IF c.status IN ('DISMISSED','RESOLVED') THEN RAISE EXCEPTION 'case_already_terminal'; END IF;

  v_allowed := CASE c.status
    WHEN 'NEW'             THEN ARRAY['TRIAGED','INVESTIGATING','MONITORING','DISMISSED']
    WHEN 'TRIAGED'         THEN ARRAY['INVESTIGATING','MONITORING','DISMISSED','RESOLVED']
    WHEN 'INVESTIGATING'   THEN ARRAY['MONITORING','ACTION_REQUIRED','DISMISSED','RESOLVED']
    WHEN 'MONITORING'      THEN ARRAY['INVESTIGATING','ACTION_REQUIRED','DISMISSED','RESOLVED']
    WHEN 'ACTION_REQUIRED' THEN ARRAY['INVESTIGATING','RESOLVED','DISMISSED']
    ELSE ARRAY[]::text[]
  END;
  IF NOT (p_to_status = ANY(v_allowed)) THEN RAISE EXCEPTION 'illegal_transition'; END IF;

  v_terminal := p_to_status IN ('RESOLVED','DISMISSED');
  IF v_terminal AND (p_resolution IS NULL OR length(btrim(p_resolution)) = 0) THEN
    RAISE EXCEPTION 'resolution_required';
  END IF;

  UPDATE public.poker_risk_cases
    SET status = p_to_status,
        resolution = CASE WHEN v_terminal THEN btrim(p_resolution) ELSE resolution END,
        closed_by  = CASE WHEN v_terminal THEN p_actor ELSE NULL END,
        closed_at  = CASE WHEN v_terminal THEN now() ELSE NULL END
    WHERE id = p_case_id;

  SELECT email INTO v_email FROM auth.users WHERE id = p_actor;
  INSERT INTO public.poker_risk_case_events (case_id, kind, from_status, to_status, reason, actor, actor_email)
  VALUES (p_case_id, 'status_change', c.status, p_to_status, btrim(p_reason), p_actor, v_email);
  PERFORM public.poker_audit_write(p_actor, 'risk_case_transition', p_reason, NULL, NULL, NULL, c.incident_case_id,
                                   jsonb_build_object('case_id', p_case_id, 'from', c.status, 'to', p_to_status));
  RETURN jsonb_build_object('ok', true, 'status', p_to_status);
END;
$$;

-- Add a note to a case (immutable timeline + audit). No status change.
CREATE OR REPLACE FUNCTION public.poker_risk_add_note(p_actor uuid, p_case_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF p_note IS NULL OR length(btrim(p_note)) = 0 THEN RAISE EXCEPTION 'note_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_risk_cases WHERE id = p_case_id) THEN RAISE EXCEPTION 'case_not_found'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_actor;
  INSERT INTO public.poker_risk_case_events (case_id, kind, reason, actor, actor_email)
  VALUES (p_case_id, 'note', btrim(p_note), p_actor, v_email);
  UPDATE public.poker_risk_cases SET updated_at = now() WHERE id = p_case_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Record an admin ACTION against a case. Reason + evidence_ref + actor are mandatory. This NEVER
-- moves coins: restriction-type actions delegate to the audited poker_admin_restrict_player RPC
-- (which itself moves no coins); 'coin_review' only FLAGS a ledger review for a human. Every call
-- appends an immutable event + an audit row.
CREATE OR REPLACE FUNCTION public.poker_risk_record_action(
  p_actor uuid, p_case_id uuid, p_action text, p_reason text, p_evidence_ref text,
  p_target_user_id uuid DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.poker_risk_cases%ROWTYPE;
  v_email text;
  v_restrict text;
  v_res jsonb := '{}'::jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_evidence_ref IS NULL OR length(btrim(p_evidence_ref)) = 0 THEN RAISE EXCEPTION 'evidence_ref_required'; END IF;
  IF p_action NOT IN ('no_action','monitor','restrict_private_tables','restrict_high_blind',
                      'temp_poker_suspension','account_investigation','escalation','coin_review') THEN
    RAISE EXCEPTION 'unknown_action';
  END IF;
  SELECT * INTO c FROM public.poker_risk_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;

  -- Actions that restrict play map onto the existing, audited restriction primitive. No coins move.
  v_restrict := CASE p_action
    WHEN 'restrict_private_tables' THEN 'no_join'
    WHEN 'restrict_high_blind'     THEN 'no_sit'
    WHEN 'temp_poker_suspension'   THEN 'no_join'
    ELSE NULL END;
  IF v_restrict IS NOT NULL THEN
    IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'target_user_required'; END IF;
    IF p_action = 'temp_poker_suspension' AND (p_expires_at IS NULL OR p_expires_at <= now()) THEN
      RAISE EXCEPTION 'expiry_required';
    END IF;
    v_res := public.poker_admin_restrict_player(
      p_actor, p_target_user_id, v_restrict, p_reason, p_expires_at, c.incident_case_id);
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_actor;
  INSERT INTO public.poker_risk_case_events
    (case_id, kind, action, reason, evidence_ref, target_user_id, actor, actor_email, detail)
  VALUES (p_case_id, 'action', p_action, btrim(p_reason), btrim(p_evidence_ref), p_target_user_id, p_actor, v_email,
          COALESCE(v_res,'{}'::jsonb));
  PERFORM public.poker_audit_write(p_actor, 'risk_action_' || p_action, p_reason, NULL, NULL, p_target_user_id,
                                   c.incident_case_id, jsonb_build_object('case_id', p_case_id, 'evidence_ref', p_evidence_ref));
  UPDATE public.poker_risk_cases SET updated_at = now() WHERE id = p_case_id;
  RETURN jsonb_build_object('ok', true, 'action', p_action, 'restriction', v_res);
END;
$$;

-- ── 6. Grants — service role ONLY (the admin client). The browser never reaches these. ─
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'poker_risk_upsert_case(text, int, text, text, numeric, text, uuid[], uuid[], uuid[], bigint, timestamptz, timestamptz, jsonb, jsonb)',
    'poker_risk_transition_case(uuid, uuid, text, text, text)',
    'poker_risk_add_note(uuid, uuid, text)',
    'poker_risk_record_action(uuid, uuid, text, text, text, uuid, timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
