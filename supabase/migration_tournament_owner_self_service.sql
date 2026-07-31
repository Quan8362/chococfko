-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_owner_self_service.sql  (Prompt 15F-1 — MIGRATION #12)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SELF-SERVICE tournament creation + the scoped 'owner' role. Lets ANY authenticated (non-anon)
-- user create their own tournament and become its OWNER — a full per-tournament manager (incl.
-- members.manage + delete-draft) WITHOUT becoming a global Site Admin.
--
-- Applies AFTER migration_tournament_members.sql (#9). Additive & idempotent:
--   • the role CHECK is DROPped-IF-EXISTS then re-ADDed with 'owner' included (re-run safe);
--   • CREATE UNIQUE INDEX IF NOT EXISTS for the one-active-owner rule;
--   • CREATE OR REPLACE FUNCTION for the atomic create RPC;
--   • naturally-idempotent REVOKE/GRANT.
-- Modifies NO approved migration file (1–11) and touches no existing column.
--
-- Security model:
--   • Identity is ALWAYS auth.uid() + the caller's verified JWT email — never a client argument. A
--     client can neither pick the owner user_id, the created_by, the status, nor the role.
--   • The tournament is ALWAYS created status='draft'. A client can never mint a published one.
--   • Create + owner-membership + audit rows are written in ONE exception-guarded block → strictly
--     all-or-nothing. A slug clash (or any constraint failure) rolls the whole thing back and
--     returns a typed code, leaving no orphan tournament and no ownerless tournament.
--   • At most ONE active owner per tournament (partial unique index). No owner transfer / second
--     owner is possible in this phase.
--   • The RPC is SECURITY DEFINER with a pinned search_path, EXECUTE granted to authenticated +
--     service_role only (never anon / PUBLIC). No dynamic SQL.

-- ── 1. Allow the 'owner' role in tournament_members (widen the existing CHECK) ───────────────────
-- Re-runnable: drop the old two-role constraint (if present) then add the three-role one.
ALTER TABLE public.tournament_members DROP CONSTRAINT IF EXISTS tmem_role_valid;
ALTER TABLE public.tournament_members
  ADD CONSTRAINT tmem_role_valid CHECK (role IN ('owner','manager','scorekeeper'));

-- ── 2. At most ONE active owner per tournament ──────────────────────────────────────────────────
-- Partial unique index: a tournament can have many manager/scorekeeper rows, but never two active
-- owners. Revoked/pending owner rows (should not occur in this phase) don't participate.
CREATE UNIQUE INDEX IF NOT EXISTS tmem_one_active_owner_uq
  ON public.tournament_members (tournament_id)
  WHERE role = 'owner' AND status = 'active';

-- ── 3. Atomic self-service create RPC (SECURITY DEFINER) ─────────────────────────────────────────
-- Creates a DRAFT tournament owned by the CALLER and returns a typed jsonb result. Called with the
-- caller's OWN session (authenticated role); identity comes from auth.uid() + the JWT email claim.
--   Returns: {"code":"ok","id":uuid,"slug":text}
--            {"code":"not_authenticated"} | {"code":"invalid"} | {"code":"slug_taken"}
CREATE OR REPLACE FUNCTION public.tournament_create_self_service(
  p_slug      text,
  p_name      text,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_location  text,
  p_rules_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid      uuid;
  v_email    text;
  v_name     text;
  v_slug     text;
  v_location text;
  v_rules    text;
  v_id       uuid;
BEGIN
  -- Identity — the caller's own JWT, never trusted from an argument.
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code', 'not_authenticated');
  END IF;
  v_email := lower(btrim(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  ));
  IF v_email IS NULL OR length(v_email) = 0 THEN
    RETURN jsonb_build_object('code', 'not_authenticated');
  END IF;

  -- Server-side normalization + minimal validation (the DB CHECKs are the last line of defense).
  v_name     := btrim(coalesce(p_name, ''));
  v_slug     := lower(btrim(coalesce(p_slug, '')));
  v_location := nullif(btrim(coalesce(p_location, '')), '');
  v_rules    := nullif(btrim(coalesce(p_rules_url, '')), '');
  IF length(v_name) = 0 OR length(v_slug) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at < p_starts_at THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  -- ATOMIC: tournament + owner membership + audit in ONE exception-guarded block. Any failure rolls
  -- the whole block back to the savepoint → never a tournament without an owner, never a half-write.
  BEGIN
    INSERT INTO public.tournaments
      (slug, name, starts_at, ends_at, location, rules_url, status, created_by)
    VALUES
      (v_slug, v_name, p_starts_at, p_ends_at, v_location, v_rules, 'draft', v_uid)
    RETURNING id INTO v_id;

    -- Owner membership — active, bound to the caller. role/status/user_id are ALL fixed here, so a
    -- client can never inject a different owner, role or status.
    INSERT INTO public.tournament_members
      (tournament_id, user_id, email_normalized, role, status, invited_by, invited_at, accepted_at)
    VALUES
      (v_id, v_uid, v_email, 'owner', 'active', v_uid, now(), now());

    INSERT INTO public.tournament_audit_log (tournament_id, actor_id, action, detail)
    VALUES
      (v_id, v_uid, 'tournament_created',
        jsonb_build_object('name', v_name, 'slug', v_slug, 'status_after', 'draft', 'self_service', true)),
      (v_id, v_uid, 'tournament_owner_assigned',
        jsonb_build_object('target_user_id', v_uid, 'role', 'owner', 'status_after', 'active'));
  EXCEPTION
    -- For a brand-new tournament the only reachable unique clash is the slug.
    WHEN unique_violation THEN
      RETURN jsonb_build_object('code', 'slug_taken');
    WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  RETURN jsonb_build_object('code', 'ok', 'id', v_id, 'slug', v_slug);
END;
$$;

-- ── 4. Lock down execution — authenticated + service_role only (never anon / PUBLIC) ─────────────
-- Supabase default-privilege-grants EXECUTE on a new function to anon+authenticated, so revoking
-- PUBLIC alone is not enough — revoke anon explicitly.
REVOKE ALL ON FUNCTION public.tournament_create_self_service(text, text, timestamptz, timestamptz, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_create_self_service(text, text, timestamptz, timestamptz, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_owner_self_service.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
