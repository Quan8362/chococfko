-- ============================================================
-- Migration: add status + user_id to places table
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add status column (default 'approved' so all existing places stay visible)
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- 2. Backfill: any row that somehow got NULL status → set to 'approved'
UPDATE public.places
  SET status = 'approved'
  WHERE status IS NULL;

-- 3. Make it NOT NULL
ALTER TABLE public.places
  ALTER COLUMN status SET NOT NULL;

-- 4. Add check constraint
ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_status_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 5. Add user_id to track who submitted a place (nullable for pre-existing places)
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;

-- 6. Reload PostgREST schema cache so Supabase sees the new columns immediately
NOTIFY pgrst, 'reload schema';
