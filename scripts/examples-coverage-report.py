# -*- coding: utf-8 -*-
"""Report example-sentence coverage across published japanese_words, per JLPT level.

Counts, per level:
  - total published words
  - published words WITH a non-empty examples array
  - published words WITHOUT examples (null or empty array)

Also prints one sample existing `examples` value so we can mirror the exact shape.
Read-only: issues only GET requests.
"""
import os, json, urllib.request, urllib.parse

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
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY}

def count(params):
    """Return exact row count for a filtered query using Content-Range header."""
    url = BASE + "?" + urllib.parse.urlencode(params, safe=".,()*")
    req = urllib.request.Request(url, headers={**HEADERS, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
    with urllib.request.urlopen(req) as r:
        cr = r.headers.get("Content-Range", "*/0")  # e.g. "0-0/1234"
        return int(cr.split("/")[-1])

LEVELS = ["N5", "N4", "N3", "N2", "N1"]
print(f"{'Level':<6}{'Published':>12}{'WithExamples':>14}{'NoExamples':>12}{'Coverage':>10}")
grand_total = grand_with = 0
for lv in LEVELS:
    total = count({"select": "id", "jlpt_level": "eq." + lv, "is_published": "eq.true"})
    # examples non-empty: examples is not null AND not equal to '[]'
    with_ex = count({"select": "id", "jlpt_level": "eq." + lv, "is_published": "eq.true",
                     "examples": "not.is.null", "examples": "neq.[]"})
    # The dict above can't hold examples twice; do it manually:
    url = (BASE + "?select=id&jlpt_level=eq." + lv + "&is_published=eq.true"
           + "&examples=not.is.null&examples=neq.%5B%5D")
    req = urllib.request.Request(url, headers={**HEADERS, "Prefer": "count=exact", "Range": "0-0"})
    with urllib.request.urlopen(req) as r:
        with_ex = int(r.headers.get("Content-Range", "*/0").split("/")[-1])
    no_ex = total - with_ex
    cov = (with_ex / total * 100) if total else 0
    grand_total += total; grand_with += with_ex
    print(f"{lv:<6}{total:>12}{with_ex:>14}{no_ex:>12}{cov:>9.1f}%")
print("-" * 54)
cov = (grand_with / grand_total * 100) if grand_total else 0
print(f"{'ALL':<6}{grand_total:>12}{grand_with:>14}{grand_total-grand_with:>12}{cov:>9.1f}%")

# Sample one existing examples value
url = BASE + "?select=word,reading,jlpt_level,examples&examples=not.is.null&examples=neq.%5B%5D&limit=3"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req) as r:
    rows = json.loads(r.read())
print("\nSample existing examples:")
for row in rows:
    print(f"  {row['word']} ({row.get('reading')}) [{row['jlpt_level']}]:")
    print("    " + json.dumps(row["examples"], ensure_ascii=False))
