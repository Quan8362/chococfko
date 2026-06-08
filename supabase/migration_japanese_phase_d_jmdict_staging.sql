-- ============================================================
-- Phase D: JMdict staging table + review workflow columns
-- ============================================================
-- Safe to run multiple times (idempotent).
-- Does NOT: import JMdict data, modify existing meanings,
--           change source/license of manual data, touch is_published.
-- Requires: migration_japanese_phase_b.sql already run (source, has_vi_meaning cols).
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- PART 1: Bảng staging japanese_raw_jmdict
-- ──────────────────────────────────────────────────────────────
-- Mục đích: chứa JMdict raw data trước khi xử lý.
-- Không public. Không có public SELECT policy.
-- Chỉ truy cập qua createAdminClient() (service role bypasses RLS).
-- Không có cột meaning_vi — raw table chỉ lưu tiếng Anh.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.japanese_raw_jmdict (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- JMdict identifiers
  ent_seq          text        NOT NULL,          -- JMdict entry sequence number
  word             text        NOT NULL,          -- kanji headword (k_ele/keb) hoặc kana nếu không có kanji
  reading          text        NOT NULL,          -- kana reading (r_ele/reb)
  romaji           text,                          -- romanization (generate bằng script)

  -- Linguistic fields
  pos              text[],                        -- part-of-speech từ JMdict sense
  meaning_en       text[]      NOT NULL DEFAULT '{}', -- gloss tiếng Anh từ sense/gloss[@lang='eng']

  -- Original data
  raw_json         jsonb,                         -- toàn bộ JMdict entry gốc để reference

  -- Attribution
  source           text        NOT NULL DEFAULT 'jmdict',
  license          text        DEFAULT 'CC BY-SA 3.0',   -- verify tại edrdg.org trước production
  attribution      text        DEFAULT 'JMdict/EDRDG',

  -- JLPT classification (không có trong JMdict XML, bổ sung từ external list)
  jlpt_level       text,

  -- Pipeline state
  converted_status text        NOT NULL DEFAULT 'pending',
  converted_at     timestamptz,
  error_msg        text,

  -- Timestamps
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT raw_jmdict_ent_word_reading_unique
    UNIQUE (ent_seq, word, reading),

  CONSTRAINT raw_jmdict_converted_status_check
    CHECK (converted_status IN ('pending', 'converted', 'skipped', 'error')),

  CONSTRAINT raw_jmdict_jlpt_level_check
    CHECK (jlpt_level IS NULL OR jlpt_level IN ('N5', 'N4', 'N3', 'N2', 'N1'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_jmdict_ent_seq
  ON public.japanese_raw_jmdict (ent_seq);

CREATE INDEX IF NOT EXISTS idx_raw_jmdict_word
  ON public.japanese_raw_jmdict (word);

CREATE INDEX IF NOT EXISTS idx_raw_jmdict_reading
  ON public.japanese_raw_jmdict (reading);

CREATE INDEX IF NOT EXISTS idx_raw_jmdict_converted_status
  ON public.japanese_raw_jmdict (converted_status);

CREATE INDEX IF NOT EXISTS idx_raw_jmdict_jlpt_level
  ON public.japanese_raw_jmdict (jlpt_level);

CREATE INDEX IF NOT EXISTS idx_raw_jmdict_source
  ON public.japanese_raw_jmdict (source);

-- Composite index cho batch translate script:
-- "lấy N5 entries chưa convert" là query phổ biến nhất
CREATE INDEX IF NOT EXISTS idx_raw_jmdict_jlpt_status
  ON public.japanese_raw_jmdict (jlpt_level, converted_status);

-- RLS: bật nhưng không tạo public policy → admin-only
ALTER TABLE public.japanese_raw_jmdict ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (function public.set_updated_at() đã có từ migration_places.sql)
DROP TRIGGER IF EXISTS trg_raw_jmdict_updated_at
  ON public.japanese_raw_jmdict;

CREATE TRIGGER trg_raw_jmdict_updated_at
  BEFORE UPDATE ON public.japanese_raw_jmdict
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- PART 2: Review workflow columns cho japanese_words
-- ──────────────────────────────────────────────────────────────
-- review_status  : trạng thái duyệt của entry
-- meaning_source : nguồn gốc meaning_vi
-- reviewed_at    : thời điểm approve/reject
-- review_note    : ghi chú của reviewer
--
-- Nguyên tắc:
--   - Dữ liệu thủ công (source=self): approved + manual
--   - AI-draft từ JMdict: ai_draft + jmdict_ai  (set bởi import script, không tự động)
--   - Sau khi reviewer duyệt: approved + jmdict_reviewed
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.japanese_words
  ADD COLUMN IF NOT EXISTS review_status  text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS meaning_source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS review_note    text;

-- Constraints (DROP trước để idempotent)
ALTER TABLE public.japanese_words
  DROP CONSTRAINT IF EXISTS japanese_words_review_status_check;
ALTER TABLE public.japanese_words
  ADD CONSTRAINT japanese_words_review_status_check
    CHECK (review_status IN ('approved', 'ai_draft', 'needs_review', 'rejected'));

ALTER TABLE public.japanese_words
  DROP CONSTRAINT IF EXISTS japanese_words_meaning_source_check;
ALTER TABLE public.japanese_words
  ADD CONSTRAINT japanese_words_meaning_source_check
    CHECK (meaning_source IN ('manual', 'jmdict_ai', 'jmdict_reviewed', 'import'));

-- Indexes cho review workflow queries (admin filter, quiz filter)
CREATE INDEX IF NOT EXISTS idx_japanese_words_review_status
  ON public.japanese_words (review_status);

CREATE INDEX IF NOT EXISTS idx_japanese_words_meaning_source
  ON public.japanese_words (meaning_source);


-- ──────────────────────────────────────────────────────────────
-- PART 3: Backfill an toàn cho japanese_words
-- ──────────────────────────────────────────────────────────────
-- Không sửa: meanings, source, license, attribution,
--            is_published, frequency, hoặc bất kỳ cột nội dung nào.
-- Chỉ set: review_status, meaning_source dựa trên nguồn dữ liệu.
-- ──────────────────────────────────────────────────────────────

-- 3a. Dữ liệu thủ công → approved + manual
--     Điều kiện: source='self' HOẶC license='self-authored'
--     Bao gồm 30 seed words và toàn bộ CSV N5 đã import.
UPDATE public.japanese_words
SET
  review_status  = 'approved',
  meaning_source = 'manual'
WHERE
  source = 'self'
  OR license = 'self-authored';

-- 3b. Dữ liệu không phải thủ công đã có meaning_vi → needs_review
--     Phòng trường hợp có admin-import cũ (source='admin-import') đang ở 'approved' mặc định.
UPDATE public.japanese_words
SET
  review_status  = 'needs_review',
  meaning_source = 'import'
WHERE
  source != 'self'
  AND (license IS NULL OR license != 'self-authored')
  AND has_vi_meaning = true
  AND review_status = 'approved';   -- chỉ touch rows lấy default, không touch approved thật

-- ──────────────────────────────────────────────────────────────
-- SUMMARY
-- ──────────────────────────────────────────────────────────────
-- Tables created  : japanese_raw_jmdict
-- Columns added   : japanese_words.review_status, meaning_source, reviewed_at, review_note
-- Constraints     : review_status CHECK, meaning_source CHECK
-- Indexes added   : 7 trên raw table, 2 trên japanese_words
-- Backfill        : source=self → approved+manual | admin-import+has_vi → needs_review
-- Data unchanged  : meanings, source, license, is_published, frequency — không bị sửa
-- ──────────────────────────────────────────────────────────────
