# -*- coding: utf-8 -*-
"""Non-destructively normalize example objects that use the legacy `jp` key.

The UI (WordCard / VocabularyCard / FlashcardViewer / word detail page) renders
`example.ja`. An older jmdict import wrote examples under `jp` instead, so those
examples render blank. This script copies `jp` -> `ja` on every example object
that has a truthy `jp` and no usable `ja`, leaving jp/reading/vi/en untouched.

Nothing is deleted or overwritten — we only ADD the missing `ja` key.

Usage:
  python scripts/normalize-examples-jp-to-ja.py            # dry-run (default)
  python scripts/normalize-examples-jp-to-ja.py --commit   # apply
"""
import os, sys, json, urllib.request

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

COMMIT = "--commit" in sys.argv

def needs_fix(examples):
    if not isinstance(examples, list):
        return False
    return any(isinstance(e, dict) and e.get("jp") and not e.get("ja") for e in examples)

def fixed(examples):
    out = []
    for e in examples:
        if isinstance(e, dict) and e.get("jp") and not e.get("ja"):
            e = {**e, "ja": e["jp"]}
        out.append(e)
    return out

# Fetch all published rows with non-empty examples, paged.
to_fix = []
offset = 0
PAGE = 1000
while True:
    url = (BASE + "?select=id,examples&is_published=eq.true"
           "&examples=not.is.null&examples=neq.%5B%5D&limit=" + str(PAGE) + "&offset=" + str(offset))
    rows = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=H)).read())
    if not rows:
        break
    for r in rows:
        if needs_fix(r["examples"]):
            to_fix.append((r["id"], fixed(r["examples"])))
    offset += PAGE
    if len(rows) < PAGE:
        break

print(f"Rows needing jp->ja normalization: {len(to_fix)}")
if not COMMIT:
    print("DRY-RUN — no writes. Re-run with --commit to apply.")
    for rid, ex in to_fix[:3]:
        print(f"  {rid}: {json.dumps(ex[0], ensure_ascii=False)}")
    sys.exit(0)

done = 0
for rid, ex in to_fix:
    url = BASE + "?id=eq." + rid
    req = urllib.request.Request(
        url,
        data=json.dumps({"examples": ex}).encode(),
        method="PATCH",
        headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"})
    urllib.request.urlopen(req)
    done += 1
    if done % 200 == 0:
        print(f"  patched {done}/{len(to_fix)}")
print(f"Done. Normalized {done} rows.")
