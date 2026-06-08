-- Add UNIQUE constraint to japanese_grammar.pattern
-- Required for upsert with onConflict: 'pattern' in bulk import
-- The original migration only created a plain (non-unique) index,
-- which Supabase upsert cannot use for conflict resolution.

ALTER TABLE japanese_grammar
ADD CONSTRAINT japanese_grammar_pattern_unique UNIQUE (pattern);
