-- ============================================================
-- Migration: RLS policies for places table
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 0. Make sure RLS is enabled
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────
-- SELECT: public (anon + logged-in) can read approved places
-- ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can view approved places" ON public.places;
CREATE POLICY "Public can view approved places"
  ON public.places
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- ──────────────────────────────────────────────────────────
-- INSERT: logged-in user can submit a place (pending only,
--         and user_id must match the logged-in user)
-- ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can submit pending places" ON public.places;
CREATE POLICY "Authenticated users can submit pending places"
  ON public.places
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- ──────────────────────────────────────────────────────────
-- UPDATE / DELETE: only service-role (admin client) is used
-- for these operations → no extra policy needed;
-- service role bypasses RLS automatically.
-- ──────────────────────────────────────────────────────────

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
