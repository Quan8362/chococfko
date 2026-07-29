-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_members.sql  (Prompt 15B-1 — MIGRATION #9, applies AFTER rule_engine #8)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Scoped tournament membership + email invitations. Lets a small set of people MANAGE specific
-- tournaments WITHOUT being global Site Admins.
--
--   • Global Site Admin  = ADMIN_EMAILS only (chococfko@gmail.com). NEVER stored here.
--   • Scoped roles       = 'manager' | 'scorekeeper' (there is intentionally NO 'admin' role).
--   • Invitation flow     = Site Admin creates a PENDING row keyed by normalized email; the invitee
--                           binds it to their user_id (→ ACTIVE) on first sign-in, via the safe RPC
--                           tournament_claim_member_invitations() (auth.uid() + verified JWT email).
--
-- Depends on: migration_tournament_core.sql (tournaments, tournament_audit_log, the
-- update_updated_at_column + tournament_bump_version trigger fns). Order: migration #9, AFTER
-- migration_tournament_rule_engine.sql (#8). See the runbook §0.
--
-- Additive & idempotent: CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY
-- IF EXISTS before CREATE POLICY, naturally-idempotent REVOKE/GRANT. Modifies NO approved migration
-- (1–8) and touches no existing table's columns.
--
-- Security model (mirrors the module's service-role pattern):
--   • RLS enabled. NO anon access at all. An authenticated user may SELECT ONLY their own rows
--     (user_id = auth.uid()) — a minimal self-read policy; they can never write directly.
--   • Every admin write (invite / change-role / revoke) goes through the SERVICE-ROLE client AFTER
--     the server-side permission checker passes (members.manage → Site Admin only in 15B-1).
--   • The ONE thing an ordinary authenticated user may do is claim invitations addressed to their
--     OWN verified email, through the SECURITY DEFINER RPC below — never by writing the table.

-- ── 1. tournament_members ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  -- NULL until the invitee claims (binds) the invitation. ON DELETE SET NULL keeps the membership
  -- history row if the auth user is ever deleted (the row becomes an orphaned record, not lost).
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Always stored lowercase + trimmed (enforced by CHECK). This is the invitation key.
  email_normalized text NOT NULL,
  role             text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  invited_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  version          integer NOT NULL DEFAULT 1,   -- optimistic concurrency (trigger-bumped)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- One membership row per (tournament, email). Re-inviting a revoked member reuses this row.
  CONSTRAINT tmem_tournament_email_uq UNIQUE (tournament_id, email_normalized),
  -- Only the two scoped roles — NO 'admin' membership role (Site Admin comes from ADMIN_EMAILS).
  CONSTRAINT tmem_role_valid   CHECK (role IN ('manager','scorekeeper')),
  CONSTRAINT tmem_status_valid CHECK (status IN ('pending','active','revoked')),
  -- Email must be non-empty, already lowercased + trimmed, and look like an address.
  CONSTRAINT tmem_email_not_empty  CHECK (length(email_normalized) > 0),
  CONSTRAINT tmem_email_normalized CHECK (email_normalized = lower(btrim(email_normalized))),
  CONSTRAINT tmem_email_shape      CHECK (email_normalized LIKE '%_@_%.__%'),
  -- An ACTIVE membership MUST be bound to a user and carry an acceptance timestamp.
  CONSTRAINT tmem_active_bound CHECK (
    status <> 'active' OR (user_id IS NOT NULL AND accepted_at IS NOT NULL)),
  -- A REVOKED membership MUST record when it was revoked.
  CONSTRAINT tmem_revoked_stamped CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────────────────────
-- Admin listing per tournament (+ status). Self/role lookup by user_id. Claim lookup by email.
CREATE INDEX IF NOT EXISTS tmem_tournament_idx ON public.tournament_members (tournament_id, status);
CREATE INDEX IF NOT EXISTS tmem_user_idx       ON public.tournament_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tmem_email_pending_idx
  ON public.tournament_members (email_normalized) WHERE status = 'pending';

-- ── 3. Triggers ───────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tmem_updated_at ON public.tournament_members;
CREATE TRIGGER tmem_updated_at BEFORE UPDATE ON public.tournament_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS tmem_bump_version ON public.tournament_members;
CREATE TRIGGER tmem_bump_version BEFORE UPDATE ON public.tournament_members
  FOR EACH ROW EXECUTE FUNCTION public.tournament_bump_version();

-- ── 4. Claim RPC (SECURITY DEFINER) ─────────────────────────────────────────────────────────────
-- The ONLY way an ordinary authenticated user touches this table. Binds every PENDING invitation
-- addressed to the caller's OWN verified email to their user_id and flips it ACTIVE.
--
--   • Identity is the caller's OWN JWT — auth.uid() + the JWT's email claim — NEVER a client
--     argument. A user therefore can only ever claim invitations sent to their own email.
--   • Revoked/active rows are never touched (WHERE status = 'pending').
--   • Writes a 'tournament_member_claimed' audit row per claimed membership, atomically.
--   • Returns the claimed (tournament_id, role) rows so the caller can revalidate its views.
CREATE OR REPLACE FUNCTION public.tournament_claim_member_invitations()
RETURNS TABLE (tournament_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid   uuid;
  v_email text;
  r       record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN; -- not authenticated → nothing to claim
  END IF;

  -- Verified email from the caller's JWT claims (NOT trusted from any argument). Normalized to
  -- match the stored email_normalized exactly.
  v_email := lower(btrim(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  ));
  IF v_email IS NULL OR length(v_email) = 0 THEN
    RETURN;
  END IF;

  FOR r IN
    UPDATE public.tournament_members m
       SET user_id     = v_uid,
           status      = 'active',
           accepted_at = now(),
           revoked_at  = NULL
     WHERE m.email_normalized = v_email
       AND m.status = 'pending'
    RETURNING m.id, m.tournament_id, m.role
  LOOP
    INSERT INTO public.tournament_audit_log (tournament_id, actor_id, action, detail)
    VALUES (r.tournament_id, v_uid, 'tournament_member_claimed',
            jsonb_build_object(
              'member_id', r.id, 'role', r.role,
              'status_before', 'pending', 'status_after', 'active',
              'target_user_id', v_uid));
    tournament_id := r.tournament_id;
    role          := r.role;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

-- ── 5. Row Level Security ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.tournament_members ENABLE ROW LEVEL SECURITY;

-- Self-read only: an authenticated user sees ONLY their own bound membership rows. No anon policy →
-- anon is denied. Pending (unbound) invitations are NOT visible this way — they carry no user_id;
-- the invitee learns of them by claiming (the RPC), and Site Admin sees all via service-role.
DROP POLICY IF EXISTS tmem_self_select ON public.tournament_members;
CREATE POLICY tmem_self_select ON public.tournament_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Service-role performs every administrative mutation.
DROP POLICY IF EXISTS tmem_service_all ON public.tournament_members;
CREATE POLICY tmem_service_all ON public.tournament_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. Grants ─────────────────────────────────────────────────────────────────────────────────
-- authenticated may only SELECT (gated to own rows by the policy). Never write directly.
GRANT SELECT ON public.tournament_members TO authenticated;
GRANT ALL PRIVILEGES ON public.tournament_members TO service_role;
-- Defense-in-depth: strip anon entirely and remove any default-privilege DML for authenticated, so
-- a future policy mistake can never let a Guest read or a member self-escalate by writing the table.
REVOKE ALL ON public.tournament_members FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tournament_members FROM authenticated;

-- Claim RPC: authenticated only (never anon / never PUBLIC).
REVOKE ALL ON FUNCTION public.tournament_claim_member_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_claim_member_invitations() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_members.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
