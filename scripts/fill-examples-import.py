# -*- coding: utf-8 -*-
"""Import authored example sentences onto existing published words.

Input: a "ready" JSON file shaped as
  [{ "id": "<uuid>", "word": "...", "examples": [
        {"ja":"...","reading":"...","vi":"...","en":"..."}, ... ] }, ...]

Each word is PATCHed by id with a guard so the write only lands while the row
still has NO renderable example — fully non-destructive. The guard:
    id=eq.<id> AND is_published=eq.true AND (examples IS NULL OR examples = '[]')
Rows that already gained a `ja`-keyed example since the worklist was built are
skipped automatically (the guard matches 0 rows).

Validation before any write:
  - 2-3 examples per word
  - every example has non-empty ja / reading / vi / en
  - the target word (or its kana reading) appears in the ja sentence
  - de-dupe identical ja sentences within a word

Usage:
  python scripts/fill-examples-import.py data/japanese/examples-n5-wave-001.json
  python scripts/fill-examples-import.py data/japanese/examples-n5-wave-001.json --commit
"""
import os, sys, json, urllib.request, urllib.error

HERE = os.path.dirname(__file__)
ENV_FILE = os.path.join(HERE, "..", ".env.local")
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

if len(sys.argv) < 2:
    print("usage: fill-examples-import.py <ready.json> [--commit]"); sys.exit(1)
READY = sys.argv[1] if os.path.isabs(sys.argv[1]) else os.path.join(os.getcwd(), sys.argv[1])
COMMIT = "--commit" in sys.argv

with open(READY, encoding="utf-8") as f:
    entries = json.load(f)

def kanji_stem(w):
    """Drop the trailing run of hiragana okurigana so conjugated forms match.
    差し上げる -> 差し上, 向ける -> 向, 少ない -> 少. All-kana words -> ''."""
    i = len(w)
    while i > 0 and "぀" <= w[i - 1] <= "ゟ":
        i -= 1
    return w[:i]

def appears(word, reading, ja, ex_reading):
    """The target word genuinely shows up in the sentence (any inflected form)."""
    ks = kanji_stem(word)
    return (
        (word and word in ja)
        or (ks and ks in ja)
        or (reading and reading in ex_reading)
        or (reading and reading in ja)
    )

# ── Validate ──
errors = []
seen_ids = set()
clean = []
for idx, e in enumerate(entries):
    label = f"#{idx} {e.get('word','?')}"
    if not e.get("id"):
        errors.append(f"{label}: missing id"); continue
    if e["id"] in seen_ids:
        errors.append(f"{label}: duplicate id in file"); continue
    seen_ids.add(e["id"])
    word = e.get("word", "")
    reading = e.get("reading") or ""
    exs = e.get("examples") or []
    if not (2 <= len(exs) <= 3):
        errors.append(f"{label}: needs 2-3 examples, has {len(exs)}"); continue
    seen_ja = set()
    ok = True
    for j, ex in enumerate(exs):
        for k in ("ja", "reading", "vi", "en"):
            if not (ex.get(k) or "").strip():
                errors.append(f"{label} ex{j}: empty {k}"); ok = False
        ja = (ex.get("ja") or "")
        if not appears(word, reading, ja, ex.get("reading") or ""):
            errors.append(f"{label} ex{j}: target word/reading not in sentence: {ja}"); ok = False
        if ja in seen_ja:
            errors.append(f"{label} ex{j}: duplicate sentence within word"); ok = False
        seen_ja.add(ja)
    if ok:
        clean.append(e)

print(f"Entries: {len(entries)}  valid: {len(clean)}  errors: {len(errors)}")
if errors:
    print("VALIDATION ERRORS (first 20):")
    for m in errors[:20]:
        print("  -", m)
    if not COMMIT:
        print("Fix errors then re-run. (Dry-run aborts on errors.)")
    # Never write invalid rows; only the clean ones proceed on commit.

if not COMMIT:
    print("DRY-RUN — no writes. Re-run with --commit to apply the valid entries.")
    sys.exit(0 if not errors else 1)

if errors:
    print("Refusing to commit while there are validation errors."); sys.exit(1)

# ── Commit (guarded PATCH by id) ──
GUARD = "&is_published=eq.true&or=(examples.is.null,examples.eq.%5B%5D)"
written = skipped = 0
for e in clean:
    url = BASE + "?id=eq." + e["id"] + GUARD
    payload = {"examples": [{"ja": x["ja"], "reading": x["reading"], "vi": x["vi"], "en": x["en"]}
                            for x in e["examples"]]}
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="PATCH",
        headers={**H, "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        res = json.loads(urllib.request.urlopen(req).read())
        if res:
            written += 1
        else:
            skipped += 1  # guard matched 0 rows (already filled / not published)
    except urllib.error.HTTPError as err:
        print(f"  ! {e['word']}: HTTP {err.code} {err.read().decode()[:200]}")
print(f"Done. Written: {written}  skipped(guard): {skipped}")
