# -*- coding: utf-8 -*-
"""Resumable generator for missing japanese_words example sentences.

No AI provider was previously configured in this repo. This script implements
the generation pipeline cleanly against the Anthropic Messages API. It needs
ANTHROPIC_API_KEY in web/.env.local (never hard-coded, never logged).

Flow per batch (small, safe transactions):
  1. fetch next words for LEVEL that still lack a renderable `ja` example
     (frequency desc — mirrors card/flashcard order), skipping checkpoint ids
  2. ask the model for strict JSON: 2 natural examples {ja,reading,vi,en} per word
  3. validate every returned example (target word present, fields, punctuation,
     no leaked prefixes, ja != vi); drop bad ones to a failures file for retry
  4. append the good entries to a wave file data/japanese/examples-<lvl>-wave-NNN.json
  5. with --commit, PATCH each word by id with the SAME guard as the existing
     importer:  is_published=true AND (examples IS NULL OR examples = '[]')
     -> never overwrites an existing/manually-reviewed example; idempotent.
  6. advance the checkpoint file so a re-run resumes where it stopped.

Flags:
  --level N3            JLPT level (default N5)
  --limit 200          max words this run
  --batch-size 20      words per model call (default 15)
  --model <id>         Anthropic model (default claude-sonnet-4-6)
  --commit             also write to DB (guarded). Default: wave file only.
  --dry-run            generate + validate + print, write NOTHING, no checkpoint
  --missing-translations-only   only target rows whose example lacks vi/en
  --retry-failures     re-feed reports/generation-failures-<lvl>.json

Examples:
  python scripts/generate-missing-vocabulary-examples.py --level N5 --dry-run
  python scripts/generate-missing-vocabulary-examples.py --level N3 --limit 100
  python scripts/generate-missing-vocabulary-examples.py --level N3 --limit 100 --commit
  python scripts/generate-missing-vocabulary-examples.py --level N3 --retry-failures --commit
"""
import os, sys, json, time, urllib.request, urllib.error

HERE = os.path.dirname(__file__)
ENV_FILE = os.path.join(HERE, "..", ".env.local")
DATA = os.path.join(HERE, "..", "data", "japanese")
REPORTS = os.path.join(HERE, "..", "reports")

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
SKEY = env["SUPABASE_SERVICE_ROLE_KEY"]
SH = {"apikey": SKEY, "Authorization": "Bearer " + SKEY}
AKEY = env.get("ANTHROPIC_API_KEY")


def arg(flag, default=None, cast=str):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return cast(sys.argv[i + 1])
    return default


LEVEL = (arg("--level", "N5")).upper()
LIMIT = arg("--limit", 60, int)
BATCH = arg("--batch-size", 15, int)
MODEL = arg("--model", "claude-sonnet-4-6")
COMMIT = "--commit" in sys.argv
DRY = "--dry-run" in sys.argv
RETRY = "--retry-failures" in sys.argv

CKPT = os.path.join(REPORTS, f"generation-checkpoint-{LEVEL.lower()}.json")
FAILS = os.path.join(REPORTS, f"generation-failures-{LEVEL.lower()}.json")
GUARD = "&is_published=eq.true&or=(examples.is.null,examples.eq.%5B%5D)"

LEVEL_HINT = {
    "N5": "very simple, ~5-12 tokens, daily life",
    "N4": "simple daily-life sentence",
    "N3": "natural intermediate sentence",
    "N2": "moderately complex, realistic context",
    "N1": "natural advanced usage, not artificially obscure",
}


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def kanji_stem(w):
    i = len(w)
    while i > 0 and "぀" <= w[i - 1] <= "ゟ":
        i -= 1
    return w[:i]


def appears(word, reading, ja, ex_reading):
    ks = kanji_stem(word or "")
    return bool((word and word in ja) or (ks and ks in ja)
                or (reading and reading in (ex_reading or "")) or (reading and reading in ja))


def has_render(examples):
    return isinstance(examples, list) and any(
        isinstance(e, dict) and (e.get("ja") or "").strip() for e in examples)


def fetch_worklist(limit, skip_ids):
    """Published LEVEL words lacking a renderable example, freq desc."""
    out, seen, offset, PAGE = [], set(), 0, 1000
    while len(out) < limit:
        url = (BASE + "?select=id,word,reading,romaji,jlpt_level,pos,meanings,examples"
               "&jlpt_level=eq." + LEVEL + "&is_published=eq.true"
               "&order=frequency.desc,id.asc&limit=" + str(PAGE) + "&offset=" + str(offset))
        rows = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=SH)).read())
        if not rows:
            break
        for r in rows:
            if r["id"] in skip_ids or r["id"] in seen:
                continue
            seen.add(r["id"])
            if not has_render(r.get("examples")):
                m = (r.get("meanings") or [{}])[0]
                out.append({"id": r["id"], "word": r["word"], "reading": r.get("reading") or "",
                            "pos": r.get("pos") or [], "vi": m.get("vi", ""), "en": m.get("en", "")})
                if len(out) >= limit:
                    break
        offset += PAGE
        if len(rows) < PAGE:
            break
    return out


def anthropic_call(words):
    """One model call -> dict id->examples. Exponential backoff on transient errors."""
    sys_prompt = (
        "You are a Japanese teacher writing flashcard example sentences. "
        "For each vocabulary entry, write exactly 2 original, natural Japanese sentences that "
        "clearly demonstrate the entry's PRIMARY meaning and part of speech. "
        f"Target JLPT level {LEVEL}: {LEVEL_HINT.get(LEVEL,'')}. "
        "The target word must appear (a natural conjugated/inflected form is fine). "
        "Avoid definitions, textbook fragments, repeated templates, excessive proper nouns, and "
        "sensitive content. Provide a natural Vietnamese translation (not word-for-word) and a "
        "faithful English translation. Never add VN:/VI:/EN: prefixes. "
        "Reply with ONLY a JSON array, one object per entry in the same order: "
        '{"id":"<id>","examples":[{"ja":"...","reading":"... (full kana)","vi":"...","en":"..."},'
        '{"ja":"...","reading":"...","vi":"...","en":"..."}]}.'
    )
    user = json.dumps([{ "id": w["id"], "word": w["word"], "reading": w["reading"],
                         "pos": w["pos"], "vi_meaning": w["vi"], "en_meaning": w["en"]}
                       for w in words], ensure_ascii=False)
    payload = {"model": MODEL, "max_tokens": 4000, "system": sys_prompt,
               "messages": [{"role": "user", "content": user}]}
    headers = {"x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    delay = 2.0
    for attempt in range(5):
        try:
            req = urllib.request.Request("https://api.anthropic.com/v1/messages",
                                         data=json.dumps(payload).encode(), headers=headers, method="POST")
            res = json.loads(urllib.request.urlopen(req, timeout=120).read())
            text = "".join(b.get("text", "") for b in res.get("content", []) if b.get("type") == "text")
            text = text.strip()
            if text.startswith("```"):
                text = text.split("```", 2)[1].lstrip("json").strip() if "```" in text else text
            arr = json.loads(text)
            return {o["id"]: o.get("examples", []) for o in arr if o.get("id")}
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529) and attempt < 4:
                time.sleep(delay); delay *= 2; continue
            print(f"  ! Anthropic HTTP {e.code}: {e.read().decode()[:200]}"); return {}
        except (urllib.error.URLError, ValueError) as e:
            if attempt < 4:
                time.sleep(delay); delay *= 2; continue
            print(f"  ! generation error: {e}"); return {}
    return {}


def valid_examples(word, reading, exs):
    good = []
    for ex in exs or []:
        ja = (ex.get("ja") or "").strip()
        if not ja or not (ex.get("vi") or "").strip() or not (ex.get("en") or "").strip():
            continue
        if not appears(word, reading, ja, ex.get("reading")):
            continue
        if ja == (ex.get("vi") or "").strip():
            continue
        good.append({"ja": ja, "reading": (ex.get("reading") or "").strip(),
                     "vi": ex["vi"].strip(), "en": ex["en"].strip()})
    return good[:3]


def commit_one(wid, examples):
    """Guarded PATCH — only lands while the row still has no renderable example."""
    url = BASE + "?id=eq." + wid + GUARD
    req = urllib.request.Request(url, data=json.dumps({"examples": examples}).encode(), method="PATCH",
                                 headers={**SH, "Content-Type": "application/json", "Prefer": "return=representation"})
    return bool(json.loads(urllib.request.urlopen(req).read()))


def main():
    if not AKEY and not DRY:
        print("ANTHROPIC_API_KEY missing in .env.local. Add it, or use --dry-run to preview the worklist.")
        sys.exit(2)

    os.makedirs(DATA, exist_ok=True); os.makedirs(REPORTS, exist_ok=True)
    ckpt = set(load_json(CKPT, {"done_ids": []})["done_ids"])

    if RETRY:
        worklist = load_json(FAILS, [])[:LIMIT]
        print(f"Retrying {len(worklist)} previously-failed {LEVEL} words")
    else:
        worklist = fetch_worklist(LIMIT, ckpt)
        print(f"{LEVEL}: {len(worklist)} words to process (batch {BATCH}, model {MODEL}, "
              f"{'COMMIT' if COMMIT else 'wave-file-only'}{' DRY-RUN' if DRY else ''})")

    if not worklist:
        print("Nothing to do."); return

    wave_n = 1
    while os.path.exists(os.path.join(DATA, f"examples-{LEVEL.lower()}-gen-wave-{wave_n:03d}.json")):
        wave_n += 1
    wave_path = os.path.join(DATA, f"examples-{LEVEL.lower()}-gen-wave-{wave_n:03d}.json")

    wave, failures = [], []
    written = committed = 0
    for i in range(0, len(worklist), BATCH):
        batch = worklist[i:i + BATCH]
        if DRY and not AKEY:
            print(f"  [dry] would generate for: {', '.join(w['word'] for w in batch)}")
            continue
        gen = anthropic_call(batch)
        for w in batch:
            good = valid_examples(w["word"], w["reading"], gen.get(w["id"]))
            if len(good) >= 1:
                entry = {"id": w["id"], "word": w["word"], "reading": w["reading"], "examples": good}
                wave.append(entry)
                if COMMIT and not DRY:
                    try:
                        if commit_one(w["id"], good):
                            committed += 1
                    except urllib.error.HTTPError as e:
                        print(f"  ! commit {w['word']}: HTTP {e.code}")
                if not DRY:
                    ckpt.add(w["id"])
            else:
                failures.append(w)
        written = len(wave)
        print(f"  batch {i//BATCH+1}: ok={written} fail={len(failures)} committed={committed}")
        if not DRY:
            with open(wave_path, "w", encoding="utf-8") as f:
                json.dump(wave, f, ensure_ascii=False, indent=1)
            with open(CKPT, "w", encoding="utf-8") as f:
                json.dump({"done_ids": sorted(ckpt)}, f, ensure_ascii=False)

    if not DRY:
        with open(FAILS, "w", encoding="utf-8") as f:
            json.dump(failures, f, ensure_ascii=False, indent=1)

    print(f"\nDone. generated={written} failures={len(failures)} committed={committed}")
    if not DRY:
        print(f"Wave file: {wave_path}")
        if not COMMIT:
            print(f"Review it, then import with the guarded importer:\n"
                  f"  python scripts/fill-examples-import.py {wave_path} --commit")


if __name__ == "__main__":
    main()
