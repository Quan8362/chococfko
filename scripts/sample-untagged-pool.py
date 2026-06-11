# -*- coding: utf-8 -*-
"""Sample untagged pending staging entries to find new N4 vocabulary candidates."""

import urllib.request, urllib.error, json, sys
import io

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY  = env["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP ERROR {e.code}: {e.read().decode()[:200]}")
        return []

# Sample at different offsets to get a variety
# Focus on entries with short word forms (1-4 chars) that look N4-appropriate
print("=== UNTAGGED STAGING ENTRIES (SAMPLE) ===")
print("Format: word | reading | meanings")
print()

# Get entries with N5 or N3 tagged but not converted (might be reclassifiable)
for level in ["N5", "N3", "N2"]:
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + f"?jlpt_level=eq.{level}&converted_status=eq.pending"
           + "&select=word,reading,meaning_en,ent_seq&limit=5")
    data = fetch(url)
    print(f"--- Sample {level} untagged ---")
    for row in data:
        en = row.get("meaning_en", [])[:3]
        print(f"  {row.get('word')} | {row.get('reading')} | {' | '.join(en)} [ent:{row.get('ent_seq')}]")
    print()

# Get null-tagged entries at various offsets
for offset in [0, 5000, 20000, 50000, 100000, 150000]:
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?jlpt_level=is.null&converted_status=eq.pending"
           + f"&select=word,reading,meaning_en,pos,ent_seq&limit=30&offset={offset}")
    data = fetch(url)
    print(f"--- Offset {offset} ---")
    for row in data:
        en = row.get("meaning_en", [])
        if not en:
            continue
        word = row.get("word", "")
        reading = row.get("reading", "")
        pos = row.get("pos", [])
        # Only show entries that look potentially N4-appropriate:
        # word length 1-6 chars, has meaning_en
        if len(word) <= 6:
            print(f"  {word} | {reading} | {' | '.join(en[:3])} | pos={pos[:2]} | ent:{row.get('ent_seq')}")
    print()
