# -*- coding: utf-8 -*-
"""Probe ent_seq 1553000–1700000 for N3-appropriate entries."""
import urllib.request, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
OUT_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n3-candidates-7.txt"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_raw_jmdict"
KEY  = env["SUPABASE_SERVICE_ROLE_KEY"]

all_rows = []
offset = 0
batch = 1000
while True:
    url = (BASE
           + "?select=ent_seq,word,reading,pos,jlpt_level,meaning_en"
           + "&ent_seq=gte.1553000&ent_seq=lte.1700000"
           + "&order=ent_seq.asc"
           + f"&limit={batch}&offset={offset}")
    req = urllib.request.Request(url, headers={
        "apikey": KEY, "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req) as r:
        rows = json.loads(r.read())
    if not rows:
        break
    all_rows.extend(rows)
    offset += batch
    if len(rows) < batch:
        break

# Keep rows likely useful for N3 study: skip very long meaning_en (>8 meanings = rare/technical),
# skip obvious junk (mahjong, archaic-only, etc.)
SKIP_KEYWORDS = ["mahjong", "shogi", "archaic", "ramen", "prefecture", "city in"]

kept = []
for r in all_rows:
    raw_meaning = r.get("meaning_en") or []
    # meaning_en may be a JSONB list or a pipe-separated string
    if isinstance(raw_meaning, list):
        meaning_parts = raw_meaning
        meaning_str = " | ".join(str(m) for m in meaning_parts)
    else:
        meaning_str = str(raw_meaning)
        meaning_parts = [p.strip() for p in meaning_str.split("|")]
    if len(meaning_parts) > 8:
        continue
    lower = meaning_str.lower()
    if any(kw in lower for kw in SKIP_KEYWORDS):
        continue
    r["_meaning_str"] = meaning_str
    kept.append(r)

with open(OUT_FILE, "w", encoding="utf-8", newline="\n") as f:
    for r in kept:
        word    = r.get("word", "")
        reading = r.get("reading", "")
        seq     = r.get("ent_seq", "")
        meaning = r.get("_meaning_str", "")[:80]
        f.write(f"{word}\t{reading}\t{seq}\t{meaning}\n")
    f.write(f"Total\t{len(kept)}\n")

print(f"Raw fetched: {len(all_rows)}")
print(f"After filter: {len(kept)}")
print(f"Written to {OUT_FILE}")
