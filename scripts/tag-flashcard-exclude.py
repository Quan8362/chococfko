# -*- coding: utf-8 -*-
"""Tag true JMdict-artifact records with 'flashcard_exclude' so the Flashcard
queries can hide them (they have no example and cannot safely receive one).

Reads reports/vocabulary-example-manual-review-<lvl>.csv and appends the tag to
each listed record. Idempotent (won't duplicate the tag) and SAFE: it refuses to
tag any record that already has a renderable example, so a genuine word can never
be hidden by mistake. Read-modify-write of the tags array per row.

Usage:
  python scripts/tag-flashcard-exclude.py N5            # dry-run
  python scripts/tag-flashcard-exclude.py N5 --commit
"""
import os, sys, csv, json, urllib.request

TAG = "flashcard_exclude"
HERE = os.path.dirname(__file__)
ENV_FILE = os.path.join(HERE, "..", ".env.local")
REPORTS = os.path.join(HERE, "..", "reports")

env = {}
for l in open(ENV_FILE, encoding="utf-8"):
    l = l.strip()
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

LEVEL = (sys.argv[1] if len(sys.argv) > 1 else "N5").upper()
COMMIT = "--commit" in sys.argv
csv_path = os.path.join(REPORTS, f"vocabulary-example-manual-review-{LEVEL.lower()}.csv")
ids = [r["id"] for r in csv.DictReader(open(csv_path, encoding="utf-8"))]


def has_render(examples):
    return isinstance(examples, list) and any(
        isinstance(e, dict) and (e.get("ja") or "").strip() for e in examples)


tagged = skipped = guarded = 0
for wid in ids:
    url = BASE + "?select=id,word,tags,examples&id=eq." + wid
    row = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=H)).read())
    if not row:
        continue
    row = row[0]
    if has_render(row.get("examples")):
        guarded += 1; continue  # safety: never hide a word that has an example
    tags = row.get("tags") or []
    if TAG in tags:
        skipped += 1; continue
    if not COMMIT:
        tagged += 1; continue
    new_tags = tags + [TAG]
    req = urllib.request.Request(
        BASE + "?id=eq." + wid, data=json.dumps({"tags": new_tags}).encode(), method="PATCH",
        headers={**H, "Content-Type": "application/json", "Prefer": "return=representation"})
    if json.loads(urllib.request.urlopen(req).read()):
        tagged += 1

print(f"{LEVEL}: {'tagged' if COMMIT else 'would tag'} {tagged}, already-tagged {skipped}, "
      f"skipped-has-example {guarded} ({'COMMIT' if COMMIT else 'dry-run'})")
