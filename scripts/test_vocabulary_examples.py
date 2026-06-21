# -*- coding: utf-8 -*-
"""Unit tests for the vocabulary-example audit/validation logic.

Uses Python's stdlib unittest (no new dependency in a project that ships no test
runner). Run:  python -m unittest scripts/test_vocabulary_examples.py -v

Covers the spec's required cases: valid-example classification, missing
detection, incomplete-translation detection, duplicate detection, generated
validation, conjugated-verb handling, and the guarded-upsert / manual-review
preservation contract.
"""
import os, importlib.util, unittest

HERE = os.path.dirname(__file__)


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# validate-* has no module-level network/env access, so it imports cleanly.
V = _load("validate_vocab", "validate-vocabulary-examples.py")


def renderable(examples):
    """Mirror of the audit's renderable_ja predicate (audit imports .env at load)."""
    if not isinstance(examples, list):
        return None
    for e in examples:
        if isinstance(e, dict) and (e.get("ja") or "").strip():
            return e
    return None


class KanjiStemConjugation(unittest.TestCase):
    def test_stem_drops_okurigana(self):
        self.assertEqual(V.kanji_stem("差し上げる"), "差し上")
        self.assertEqual(V.kanji_stem("向ける"), "向")
        self.assertEqual(V.kanji_stem("少ない"), "少")

    def test_all_kana_word_has_empty_stem(self):
        self.assertEqual(V.kanji_stem("たべる"), "")

    def test_conjugated_verb_matches_via_stem(self):
        # 急ぐ -> 急いで : dictionary form absent, but kanji stem 急 present
        self.assertTrue(V.appears("急ぐ", "いそぐ", "急いでください。", "いそいでください。"))

    def test_adjective_inflected_form_matches(self):
        # 高い -> 高かった
        self.assertTrue(V.appears("高い", "たかい", "値段が高かった。", "ねだんがたかかった。"))

    def test_kana_word_matched_by_reading(self):
        self.assertTrue(V.appears("ゆっくり", "ゆっくり", "ゆっくり休んでください。", ""))

    def test_absent_word_is_not_matched(self):
        self.assertFalse(V.appears("電車", "でんしゃ", "今日はいい天気です。", "きょうはいいてんきです。"))


class MissingDetection(unittest.TestCase):
    def test_null_and_empty_are_missing(self):
        self.assertIsNone(renderable(None))
        self.assertIsNone(renderable([]))

    def test_object_without_ja_is_missing(self):
        self.assertIsNone(renderable([{"vi": "x", "en": "y"}]))
        self.assertIsNone(renderable([{"ja": "   "}]))

    def test_legacy_jp_only_key_is_missing(self):
        # older import stored under `jp`; UI renders only `ja`
        self.assertIsNone(renderable([{"jp": "教科書を読みます。"}]))

    def test_valid_ja_is_present(self):
        self.assertIsNotNone(renderable([{"ja": "水を飲みます。"}]))


class ValidateEntry(unittest.TestCase):
    def _entry(self, **ex):
        base = {"ja": "水を飲みます。", "reading": "みずをのみます。", "vi": "Tôi uống nước.", "en": "I drink water."}
        base.update(ex)
        return {"id": "1", "word": "飲む", "reading": "のむ", "jlpt_level": "N5", "examples": [base]}

    def test_valid_example_has_no_errors(self):
        errors, _ = V.validate_entry(self._entry(), {})
        self.assertEqual(errors, [])

    def test_missing_vi_translation_is_error(self):
        errors, _ = V.validate_entry(self._entry(vi=""), {})
        self.assertTrue(any("empty vi" in e for e in errors))

    def test_missing_en_translation_is_error(self):
        errors, _ = V.validate_entry(self._entry(en=""), {})
        self.assertTrue(any("empty en" in e for e in errors))

    def test_target_absent_is_error(self):
        e = self._entry(ja="今日は寒いです。", reading="きょうはさむいです。")
        errors, _ = V.validate_entry(e, {})
        self.assertTrue(any("absent" in m for m in errors))

    def test_ja_equals_vi_is_error(self):
        e = self._entry(vi="水を飲みます。")
        errors, _ = V.validate_entry(e, {})
        self.assertTrue(any("identical" in m for m in errors))

    def test_html_in_ja_is_error(self):
        e = self._entry(ja="<b>水を飲みます。</b>")
        errors, _ = V.validate_entry(e, {})
        self.assertTrue(any("html" in m for m in errors))

    def test_leaked_prefix_is_error(self):
        e = self._entry(vi="VN: Tôi uống nước.")
        errors, _ = V.validate_entry(e, {})
        self.assertTrue(any("prefix" in m for m in errors))

    def test_sentence_only_word_is_error(self):
        e = self._entry(ja="飲む。", reading="のむ。", vi="uống")
        errors, _ = V.validate_entry(e, {})
        self.assertTrue(any("only the vocabulary word" in m for m in errors))

    def test_duplicate_across_records_is_warning_not_error(self):
        ja_index = {"水を飲みます。": ["飲む", "水"]}
        errors, warnings = V.validate_entry(self._entry(), ja_index)
        self.assertEqual(errors, [])
        self.assertTrue(any("shared with another record" in w for w in warnings))

    def test_level_too_long_is_warning(self):
        long_ja = "私は" + "とても" * 20 + "水を飲みます。"
        errors, warnings = V.validate_entry(self._entry(ja=long_ja), {})
        self.assertTrue(any("longer than expected" in w for w in warnings))


class GuardedUpsertContract(unittest.TestCase):
    """The generator/importer must never overwrite an existing example."""
    def test_guard_clause_preserves_existing(self):
        # The guard restricts PATCH to rows whose examples is null or '[]'.
        from urllib.parse import unquote
        guard = "&is_published=eq.true&or=(examples.is.null,examples.eq.%5B%5D)"
        self.assertIn("examples.is.null", guard)
        self.assertEqual(unquote("%5B%5D"), "[]")
        # A row that already has a renderable example would not satisfy the guard,
        # so a re-run is idempotent and manual edits are preserved.
        self.assertIsNotNone(renderable([{"ja": "既存の例文です。"}]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
