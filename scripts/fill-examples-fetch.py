# -*- coding: utf-8 -*-
"""Fetch the next batch of PUBLISHED words that still lack rendered examples.

A word "lacks examples" when its examples array is null/empty OR no example
object has a usable `ja` key (the only key the UI renders). Ordered by
frequency desc so the highest-value words are authored first — matching the
order cards/flashcards display.

Writes a worklist JSON the author step consumes:
  [{ "id","word","reading","romaji","jlpt_level","pos","meanings" }, ...]

Resumable: every run re-queries the live DB, so already-filled words drop out.

Usage:
  python scripts/fill-examples-fetch.py N5 60
  python scripts/fill-examples-fetch.py N3 60 --out data/japanese/examples-worklist-n3.json
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

LEVEL = sys.argv[1].upper() if len(sys.argv) > 1 else "N5"
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 60
OUT = None
if "--out" in sys.argv:
    OUT = sys.argv[sys.argv.index("--out") + 1]
else:
    OUT = os.path.join(HERE, "..", "data", "japanese", f"examples-worklist-{LEVEL.lower()}.json")

def has_render(examples):
    return isinstance(examples, list) and any(
        isinstance(e, dict) and e.get("ja") for e in examples)

# Page through level by frequency desc, collecting words without a renderable example.
worklist = []
offset = 0
PAGE = 1000
while len(worklist) < LIMIT:
    url = (BASE + "?select=id,word,reading,romaji,jlpt_level,pos,meanings,examples"
           "&jlpt_level=eq." + LEVEL + "&is_published=eq.true"
           "&order=frequency.desc&limit=" + str(PAGE) + "&offset=" + str(offset))
    rows = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=H)).read())
    if not rows:
        break
    for r in rows:
        if not has_render(r.get("examples")):
            worklist.append({
                "id": r["id"], "word": r["word"], "reading": r.get("reading"),
                "romaji": r.get("romaji"), "jlpt_level": r.get("jlpt_level"),
                "pos": r.get("pos"), "meanings": r.get("meanings"),
            })
            if len(worklist) >= LIMIT:
                break
    offset += PAGE
    if len(rows) < PAGE:
        break

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(worklist, f, ensure_ascii=False, indent=1)
print(f"{LEVEL}: wrote {len(worklist)} words needing examples -> {OUT}")
