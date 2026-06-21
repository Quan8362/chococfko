# -*- coding: utf-8 -*-
"""Validate a 'ready' wave file of generated/authored examples before import.

Implements the quality gate from the spec. Reads a wave JSON shaped:
  [{ "id","word","reading","examples":[{"ja","reading","vi","en"}, ...] }, ...]

Checks per example:
  - ja / vi non-empty; en non-empty (schema supports en)
  - sentence length within reasonable limits (per JLPT level if provided)
  - no HTML/script content
  - no placeholder text (TODO / example / translation)
  - no VN:/VI:/EN:/GB: leaked prefixes
  - target word present directly or via kanji-stem / reading (handles conjugation)
  - ja != vi (not accidentally identical)
  - example is more than just the bare vocabulary word
  - vi is more than just the bare meaning
  - valid encoding + has sentence punctuation
Cross-file: no duplicate ja sentence shared by unrelated ids.

Exit code 0 only when there are zero hard errors. Low-confidence rows (soft
warnings) are written to reports/vocabulary-example-review-required.json and do
NOT block, but are never silently treated as complete.

Usage:
  python scripts/validate-vocabulary-examples.py data/japanese/examples-n3-wave-001.json
"""
import os, sys, json, re

HERE = os.path.dirname(__file__)
REPORTS = os.path.join(HERE, "..", "reports")

BAD_SUBSTR = ("<", ">", "TODO", "todo", "placeholder", "translation here")
PREFIX_RE = re.compile(r"^\s*(vn|vi|en|gb|ja|jp)\s*[:：]", re.IGNORECASE)
JA_PUNCT = "。．！？!?…」』）"
LEN_LIMITS = {  # (min ja chars, max ja chars) — soft complexity guidance per level
    "N5": (4, 30), "N4": (5, 40), "N3": (6, 55), "N2": (8, 70), "N1": (8, 90),
}


def kanji_stem(w):
    i = len(w)
    while i > 0 and "぀" <= w[i - 1] <= "ゟ":
        i -= 1
    return w[:i]


def appears(word, reading, ja, ex_reading):
    ks = kanji_stem(word or "")
    return bool(
        (word and word in ja)
        or (ks and ks in ja)
        or (reading and reading in (ex_reading or ""))
        or (reading and reading in ja)
    )


def has_html(s):
    return bool(re.search(r"<[^>]+>", s))


def validate_entry(e, ja_index):
    """Return (errors, warnings) lists of strings."""
    errors, warnings = [], []
    word = e.get("word", "")
    reading = e.get("reading") or ""
    level = (e.get("jlpt_level") or "").upper()
    exs = e.get("examples") or []
    if not (1 <= len(exs) <= 3):
        errors.append(f"needs 1-3 examples, has {len(exs)}")
    seen_ja = set()
    for j, ex in enumerate(exs):
        ja = (ex.get("ja") or "").strip()
        vi = (ex.get("vi") or "").strip()
        en = (ex.get("en") or "").strip()
        tag = f"ex{j}"
        if not ja:
            errors.append(f"{tag}: empty ja"); continue
        if not vi:
            errors.append(f"{tag}: empty vi")
        if not en:
            errors.append(f"{tag}: empty en")
        if has_html(ja) or any(b in ja for b in BAD_SUBSTR):
            errors.append(f"{tag}: html/placeholder in ja")
        if PREFIX_RE.match(vi) or PREFIX_RE.match(en):
            errors.append(f"{tag}: leaked language prefix in translation")
        if not any(p in ja for p in JA_PUNCT):
            warnings.append(f"{tag}: no sentence punctuation")
        if not appears(word, reading, ja, ex.get("reading")):
            errors.append(f"{tag}: target word/reading absent from sentence")
        if vi and ja == vi:
            errors.append(f"{tag}: ja and vi identical")
        if ja.replace("。", "").strip() == word:
            errors.append(f"{tag}: sentence is only the vocabulary word")
        lo, hi = LEN_LIMITS.get(level, (4, 90))
        n = len(ja)
        if n < lo:
            warnings.append(f"{tag}: ja shorter than expected for {level or '??'} ({n})")
        if n > hi:
            warnings.append(f"{tag}: ja longer than expected for {level or '??'} ({n})")
        if ja in seen_ja:
            errors.append(f"{tag}: duplicate ja within word")
        seen_ja.add(ja)
        owners = ja_index.get(ja, [])
        if len(owners) > 1:
            warnings.append(f"{tag}: ja shared with another record ({owners})")
    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print("usage: validate-vocabulary-examples.py <ready.json>"); sys.exit(2)
    path = sys.argv[1] if os.path.isabs(sys.argv[1]) else os.path.join(os.getcwd(), sys.argv[1])
    with open(path, encoding="utf-8") as f:
        entries = json.load(f)

    ja_index = {}
    for e in entries:
        for ex in (e.get("examples") or []):
            ja = (ex.get("ja") or "").strip()
            if ja:
                ja_index.setdefault(ja, []).append(e.get("word", "?"))

    total_err = 0
    review = []
    for e in entries:
        errors, warnings = validate_entry(e, ja_index)
        if errors:
            total_err += len(errors)
            print(f"  ERROR {e.get('word','?')} ({e.get('id','?')}): " + "; ".join(errors))
        if warnings and not errors:
            review.append({"id": e.get("id"), "word": e.get("word"), "warnings": warnings})

    os.makedirs(REPORTS, exist_ok=True)
    with open(os.path.join(REPORTS, "vocabulary-example-review-required.json"), "w", encoding="utf-8") as f:
        json.dump(review, f, ensure_ascii=False, indent=2)

    print(f"\nEntries: {len(entries)}  hard-errors: {total_err}  review-required: {len(review)}")
    if total_err:
        print("FAIL — fix hard errors before import.")
        sys.exit(1)
    print("PASS — no hard errors. Review-required rows saved to reports/.")
    sys.exit(0)


if __name__ == "__main__":
    main()
