# -*- coding: utf-8 -*-
"""
import-grammar-ready.py  (grammar counterpart of safe-import-jmdict-ready.ts)

Reads a reviewed grammar wave JSON file and inserts each pattern into
japanese_grammar as a DRAFT (is_published=false) via the Supabase REST API.

japanese_grammar has NO review_status column (unlike japanese_words), so the
draft/publish gate is `is_published` — which is exactly what the public grammar
page filters on. New rows go in is_published=false; approve-grammar-wave.py
flips them to true.

Safety:
  - De-dupes against existing patterns already in the DB (never overwrites the
    hand-authored seed rows or anything imported by an earlier wave).
  - on_conflict=pattern + resolution=ignore-duplicates → a colliding pattern is
    skipped, never updated.
  - All inserted rows: is_published=false, source=self, license=self-authored.

Usage (run from web/):
  python scripts/import-grammar-ready.py --input data/japanese/grammar/n5-wave01.json --dry-run
  python scripts/import-grammar-ready.py --input data/japanese/grammar/n5-wave01.json --commit
"""

import os, sys, json, argparse, urllib.request, urllib.error

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env.local")


def load_env():
    env = {}
    with open(os.path.abspath(ENV_FILE), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def rest(url, key, path, method="GET", payload=None, extra_headers=None):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url.rstrip("/") + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        return resp.headers, (json.loads(body) if body.strip() else None)


def fetch_existing_patterns(url, key):
    """Fetch every existing pattern (paginated) for de-dup."""
    patterns = set()
    page = 0
    PAGE = 1000
    while True:
        lo, hi = page * PAGE, page * PAGE + PAGE - 1
        headers, rows = rest(
            url, key,
            "/rest/v1/japanese_grammar?select=pattern",
            extra_headers={"Range-Unit": "items", "Range": f"{lo}-{hi}"},
        )
        if not rows:
            break
        for r in rows:
            patterns.add(r["pattern"])
        if len(rows) < PAGE:
            break
        page += 1
    return patterns


VALID_LEVELS = {"N5", "N4", "N3", "N2", "N1"}


def validate_entry(e, idx):
    errs = []
    for field in ("pattern", "meaning_vi", "meaning_en", "structure", "notes"):
        if not e.get(field) or not str(e[field]).strip():
            errs.append(f"#{idx} ({e.get('pattern','?')}): missing {field}")
    ex = e.get("examples")
    if not isinstance(ex, list) or len(ex) < 2:
        errs.append(f"#{idx} ({e.get('pattern','?')}): needs >=2 examples (has {len(ex) if isinstance(ex,list) else 0})")
    else:
        for j, x in enumerate(ex):
            for k in ("ja", "reading", "vi", "en"):
                if not x.get(k) or not str(x[k]).strip():
                    errs.append(f"#{idx} ({e.get('pattern','?')}) example {j}: missing {k}")
    return errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()
    if not args.dry_run and not args.commit:
        args.dry_run = True
        print("No --commit given -> defaulting to --dry-run")

    with open(args.input, encoding="utf-8") as f:
        wave = json.load(f)

    level = wave["level"]
    wave_no = int(wave["wave"])
    entries = wave["entries"]
    if level not in VALID_LEVELS:
        print(f"ERROR: bad level {level}")
        sys.exit(1)

    print(f"\n[{'DRY-RUN' if args.dry_run else 'COMMIT'}] {args.input}")
    print(f"  level={level} wave={wave_no} entries={len(entries)}")

    # validate
    all_errs = []
    seen = set()
    for i, e in enumerate(entries):
        all_errs += validate_entry(e, i)
        p = e.get("pattern", "")
        if p in seen:
            all_errs.append(f"#{i}: duplicate pattern within file: {p}")
        seen.add(p)
    if all_errs:
        print("\nVALIDATION FAILED:")
        for x in all_errs[:30]:
            print("  -", x)
        sys.exit(1)
    print("  validation OK")

    env = load_env()
    URL = env["NEXT_PUBLIC_SUPABASE_URL"]
    KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

    existing = fetch_existing_patterns(URL, KEY)
    print(f"  existing patterns in DB: {len(existing)}")

    to_insert = [e for e in entries if e["pattern"] not in existing]
    skipped = [e["pattern"] for e in entries if e["pattern"] in existing]
    print(f"  NEW to insert: {len(to_insert)}")
    print(f"  SKIP (already in DB): {len(skipped)}")
    if skipped:
        for p in skipped[:10]:
            print("    skip:", p)

    payloads = []
    for idx, e in enumerate(to_insert, start=1):
        payloads.append({
            "pattern":     e["pattern"],
            "jlpt_level":  level,
            "meaning_vi":  e["meaning_vi"],
            "meaning_en":  e["meaning_en"],
            "structure":   e["structure"],
            "notes":       e["notes"],
            "examples":    e["examples"],
            "tags":        None,
            "is_published": False,
            "source":      "self",
            "source_id":   f"grammar-{level.lower()}-w{wave_no:02d}-{idx:03d}",
            "license":     "self-authored",
            "attribution": "Cho Coc FKO (hand-authored)",
        })

    if args.dry_run:
        print("\nDRY-RUN done. Sample inserts:")
        for p in payloads[:5]:
            print(f"   {p['pattern']} -> {p['meaning_vi'][:50]}")
        print(f"\n  Would insert {len(payloads)} draft rows (is_published=false).")
        return

    if not payloads:
        print("\nNothing to insert.")
        return

    print(f"\nInserting {len(payloads)} draft rows...")
    CHUNK = 50
    inserted = 0
    for i in range(0, len(payloads), CHUNK):
        chunk = payloads[i:i + CHUNK]
        try:
            headers, rows = rest(
                URL, KEY,
                "/rest/v1/japanese_grammar?on_conflict=pattern",
                method="POST",
                payload=chunk,
                extra_headers={"Prefer": "resolution=ignore-duplicates,return=representation"},
            )
            n = len(rows) if rows else 0
            inserted += n
            print(f"  chunk {i}..{i+len(chunk)-1}: inserted {n}")
        except urllib.error.HTTPError as ex:
            print(f"  ERROR chunk {i}: HTTP {ex.code} - {ex.read().decode()[:300]}")
    print(f"\nDone. Inserted {inserted} draft rows for {level} wave {wave_no}.")
    print("Next: python scripts/approve-grammar-wave.py --input " + args.input)


if __name__ == "__main__":
    main()
