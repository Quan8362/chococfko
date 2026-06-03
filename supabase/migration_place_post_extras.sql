-- Add map_url and fee columns to posts table for place-type submissions
-- Run this in Supabase SQL editor before deploying the updated code.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS map_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS fee TEXT CHECK (fee IS NULL OR fee IN ('free', 'paid'));

-- Refresh the posts_with_author view to include new columns
-- (If your view uses SELECT *, it will auto-pick them up on next query;
--  otherwise re-create the view below.)
-- DROP VIEW IF EXISTS posts_with_author;
-- CREATE VIEW posts_with_author AS ...  (paste your existing view DDL here)
