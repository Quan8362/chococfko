-- Fix: removing a reaction does not sync in real time on other clients.
-- Root causes:
--   1. The client subscribed to DELETE with a `room_id=eq.X` filter. Supabase
--      evaluates DELETE filters against payload.old; this is unreliable and
--      silently drops DELETE events. The client now subscribes without a filter
--      and scopes deletes client-side.
--   2. DELETE realtime payloads only include columns present in REPLICA IDENTITY.
--      Default identity = PK only, so message_id/emoji/room_id are missing from
--      payload.old and the client cannot apply the removal. REPLICA IDENTITY FULL
--      ships every column in payload.old.
-- This migration is idempotent — safe to re-run.

-- Ensure DELETE events carry all columns in payload.old
ALTER TABLE public.community_chat_reactions REPLICA IDENTITY FULL;

-- Ensure the table is part of the realtime publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;
