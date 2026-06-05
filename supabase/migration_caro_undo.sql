-- ── CARO UNDO LAST MOVE ──────────────────────────────────────────────────────
-- Run in Supabase SQL Editor

-- Add undo tracking columns to caro_rooms
ALTER TABLE caro_rooms
  ADD COLUMN IF NOT EXISTS x_undo_used   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS o_undo_used   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_move_index integer   DEFAULT NULL;

-- Backfill existing rows
UPDATE caro_rooms
  SET x_undo_used = false, o_undo_used = false
  WHERE x_undo_used IS NULL OR o_undo_used IS NULL;
