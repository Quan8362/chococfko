# -*- coding: utf-8 -*-
"""Emit a manual-review report for vocabulary records that still lack an example
but are NOT safely authorable (JMdict reading/sense artifacts).

Read-only. For the given level it pulls every published word that still has no
renderable example and categorizes a likely reason so a human can decide. These
are the documented "manual-review exceptions" — deliberately left without a
fabricated sentence.

Output: reports/vocabulary-example-manual-review-<lvl>.csv

Usage:
  python scripts/mark-manual-review.py N5
"""
import os, sys, json, csv, urllib.request

HERE = os.path.dirname(__file__)
ENV_FILE = os.path.join(HERE, "..", ".env.local")
REPORTS = os.path.join(HERE, "..", "reports")

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}
LEVEL = (sys.argv[1] if len(sys.argv) > 1 else "N5").upper()


def has_render(examples):
    return isinstance(examples, list) and any(
        isinstance(e, dict) and (e.get("ja") or "").strip() for e in examples)


def is_katakana(s):
    return bool(s) and all("゠" <= c <= "ヿ" or c == "ー" for c in s)


def reason_for(word, reading, pos):
    pos = pos or []
    if is_katakana(reading or ""):
        return "non-Japanese phonetic reading (Chinese/foreign numeral or loan reading) mis-tagged N5 — JMdict artifact"
    if any(p in ("suf", "pref", "ctr", "n-suf") for p in pos) and len(word) <= 1:
        return "bound suffix/prefix/counter fragment, not a standalone headword — JMdict artifact"
    return "obscure/archaic secondary reading or sense mis-tagged as N5 — JMdict artifact; faithful standalone example not feasible"


rows, offset, PAGE, seen = [], 0, 1000, set()
while True:
    url = (BASE + "?select=id,word,reading,jlpt_level,pos,meanings,examples"
           "&jlpt_level=eq." + LEVEL + "&is_published=eq.true"
           "&order=frequency.desc,id.asc&limit=" + str(PAGE) + "&offset=" + str(offset))
    page = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=H)).read())
    if not page:
        break
    for r in page:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        if not has_render(r.get("examples")):
            m = (r.get("meanings") or [{}])[0]
            rows.append({"id": r["id"], "word": r["word"], "reading": r.get("reading") or "",
                         "pos": "|".join(r.get("pos") or []),
                         "vi": m.get("vi", ""), "en": m.get("en", ""),
                         "reason": reason_for(r["word"], r.get("reading"), r.get("pos"))})
    if len(page) < PAGE:
        break
    offset += PAGE

os.makedirs(REPORTS, exist_ok=True)
out = os.path.join(REPORTS, f"vocabulary-example-manual-review-{LEVEL.lower()}.csv")
with open(out, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["id", "word", "reading", "pos", "vi", "en", "reason"])
    w.writeheader(); w.writerows(rows)
print(f"{LEVEL}: {len(rows)} manual-review records -> {out}")
