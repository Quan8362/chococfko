-- ============================================================
-- Curated seed for japanese_word_relations
-- Run AFTER migration_japanese_word_relations.sql.
-- Only inserts a pair when BOTH words exist & are published, so it is
-- safe regardless of which entries are present. Relations are stored once
-- per pair (the runtime helper queries both directions). Idempotent.
-- ============================================================

WITH words_dedup AS (
  -- One id per word text (the highest-frequency published entry).
  SELECT DISTINCT ON (word) word, id
  FROM public.japanese_words
  WHERE is_published = true
  ORDER BY word, frequency DESC
),
pairs(src, tgt, rel) AS (
  VALUES
    -- ── Antonyms ──────────────────────────────────────────
    ('便利',   '不便',   'antonym'),
    ('簡単',   '難しい', 'antonym'),
    ('難しい', '易しい', 'antonym'),
    ('易しい', '難しい', 'antonym'),
    ('高い',   '安い',   'antonym'),
    ('高い',   '低い',   'antonym'),
    ('多い',   '少ない', 'antonym'),
    ('新しい', '古い',   'antonym'),
    ('早い',   '遅い',   'antonym'),
    ('速い',   '遅い',   'antonym'),
    ('暑い',   '寒い',   'antonym'),
    ('熱い',   '冷たい', 'antonym'),
    ('好き',   '嫌い',   'antonym'),
    ('大きい', '小さい', 'antonym'),
    ('長い',   '短い',   'antonym'),
    ('広い',   '狭い',   'antonym'),
    ('重い',   '軽い',   'antonym'),
    ('強い',   '弱い',   'antonym'),
    ('近い',   '遠い',   'antonym'),
    ('明るい', '暗い',   'antonym'),
    ('良い',   '悪い',   'antonym'),
    ('上手',   '下手',   'antonym'),
    ('安全',   '危険',   'antonym'),
    ('便利',   '不便',   'antonym'),
    ('開ける', '閉める', 'antonym'),
    ('始まる', '終わる', 'antonym'),
    ('増える', '減る',   'antonym'),

    -- ── Synonyms / near-synonyms ──────────────────────────
    ('大切',   '重要',   'synonym'),
    ('大切',   '大事',   'synonym'),
    ('簡単',   '易しい', 'near_synonym'),
    ('便利',   '役に立つ','near_synonym'),
    ('便利',   '使いやすい','near_synonym'),
    ('難しい', '困難',   'near_synonym'),
    ('きれい', '美しい', 'near_synonym'),
    ('有名',   '著名',   'near_synonym'),
    ('必要',   '不可欠', 'near_synonym'),
    ('全部',   '全て',   'synonym'),
    ('たくさん','多い',   'near_synonym'),

    -- ── Commonly confused ─────────────────────────────────
    ('暑い',   '熱い',   'confusing'),
    ('熱い',   '厚い',   'confusing'),
    ('早い',   '速い',   'confusing'),
    ('聞く',   '聴く',   'confusing'),
    ('会う',   '合う',   'confusing'),
    ('見る',   '観る',   'confusing'),
    ('帰る',   '返る',   'confusing')
)
INSERT INTO public.japanese_word_relations (source_word_id, target_word_id, relation_type, source, confidence)
SELECT s.id, t.id, p.rel, 'curated', 1.0
FROM pairs p
JOIN words_dedup s ON s.word = p.src
JOIN words_dedup t ON t.word = p.tgt
WHERE s.id <> t.id
ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING;
