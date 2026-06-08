-- jp_bookmarks table (Phase 5: Study Profile)

CREATE TABLE IF NOT EXISTS public.jp_bookmarks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    uuid        NOT NULL,
  item_type  text        NOT NULL CHECK (item_type IN ('word', 'kanji', 'grammar')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT jp_bookmarks_unique UNIQUE (user_id, item_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_jp_bookmarks_user_id    ON public.jp_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_jp_bookmarks_item_type  ON public.jp_bookmarks(user_id, item_type);

ALTER TABLE public.jp_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bookmarks"
  ON public.jp_bookmarks
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
