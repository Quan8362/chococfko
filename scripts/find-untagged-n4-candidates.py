# -*- coding: utf-8 -*-
"""
Find untagged staging entries (jlpt_level IS NULL, converted_status=pending)
that match words from our N4 CSV list (for tagging) or could be new N4 vocab.

Also samples untagged pending entries to find new N4 candidates.
"""

import csv, urllib.request, urllib.error, json, sys

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
N4_CSV   = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

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
    "Prefer": "count=exact",
}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
            count_range = r.headers.get("Content-Range", "?/?")
            return data, count_range
    except urllib.error.HTTPError as e:
        print(f"  HTTP ERROR {e.code}: {e.read().decode()[:200]}")
        return [], "0/?"

# 1. Count untagged pending entries
url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
       + "?jlpt_level=is.null&converted_status=eq.pending&select=id&limit=1")
_, cr = fetch(url)
print(f"Untagged (jlpt_level=null), pending: {cr}")

# 2. Count untagged with meanings
url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
       + "?jlpt_level=is.null&converted_status=eq.pending"
       + "&meaning_en=not.eq.%7B%7D&select=id&limit=1")
_, cr = fetch(url)
print(f"Untagged, pending, has meaning_en: {cr}")

# 3. Load our N4 word list
n4_words = set()
with open(N4_CSV, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            n4_words.add(row[0].strip())
print(f"\nOur N4 CSV has {len(n4_words)} unique words")

# 4. Find N4-CSV words that are in staging but NOT tagged as N4 yet
# (these exist in staging with jlpt_level != N4 or null but we want them)
print("\nChecking N4 CSV words that exist in staging but NOT marked as N4...")
n4_list = sorted(n4_words)
found_untagged = []
CHUNK = 40
for i in range(0, len(n4_list), CHUNK):
    batch = n4_list[i:i+CHUNK]
    words_param = "(" + ",".join(batch) + ")"
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?word=in." + urllib.request.quote(words_param)
           + "&jlpt_level=not.eq.N4"
           + "&converted_status=eq.pending"
           + "&select=word,reading,jlpt_level,meaning_en&limit=100")
    data, _ = fetch(url)
    for row in data:
        # Only include if it has meaning_en
        if row.get("meaning_en"):
            found_untagged.append(row)

print(f"N4 CSV words in staging but not N4-tagged (with meaning_en): {len(found_untagged)}")
for row in found_untagged[:20]:
    en = row.get("meaning_en", [])
    print(f"  {row.get('word')} [{row.get('reading')}] lvl={row.get('jlpt_level')} — {en[:2]}")

# 5. Sample untagged pending entries to find new N4 candidates
print("\nSampling 100 untagged pending entries with meaning_en...")
url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
       + "?jlpt_level=is.null&converted_status=eq.pending"
       + "&select=word,reading,meaning_en,pos&limit=100&offset=0")
data, cr = fetch(url)
print(f"Sample result: {len(data)} entries")
# Show ones that look N4-appropriate (short words, common kanji)
for row in data[:50]:
    en = row.get("meaning_en", [])
    if en:
        print(f"  {row.get('word')} [{row.get('reading')}] — {', '.join(en[:2])}")
