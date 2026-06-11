# -*- coding: utf-8 -*-
"""
Tags N4 CSV words that are in staging with jlpt_level=NULL (not tagged at all).
This is the fix for tag-n4-targeted.py which used not.eq.N4 — that filter
may not match NULL values in PostgREST.
"""

import csv, urllib.request, urllib.error, json, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"
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
    "Prefer": "return=minimal",
}

# Read N4 words from CSV
n4_words = []
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if not row or not row[0] or row[0].startswith("#"):
            continue
        word = row[0].strip()
        if row[2].strip() == "N4":
            n4_words.append(word)

print(f"Total N4 words in CSV: {len(n4_words)}")

# Process in chunks — PATCH where jlpt_level IS NULL (not tagged at all)
updated_null = 0
CHUNK = 40
for i in range(0, len(n4_words), CHUNK):
    batch = n4_words[i:i+CHUNK]
    words_param = "(" + ",".join(batch) + ")"
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?word=in." + urllib.request.quote(words_param)
           + "&jlpt_level=is.null"
           + "&converted_status=eq.pending")
    req = urllib.request.Request(
        url,
        data=json.dumps({"jlpt_level": "N4"}).encode(),
        method="PATCH",
        headers=HEADERS,
    )
    req.add_header("Prefer", "return=minimal,count=exact")
    try:
        with urllib.request.urlopen(req) as r:
            content_range = r.headers.get("Content-Range", "")
            if "/" in content_range:
                count_str = content_range.split("/")[-1]
                try:
                    count = int(count_str)
                    updated_null += count
                    if count > 0:
                        print(f"  Chunk {i//CHUNK}: tagged {count} null entries")
                except ValueError:
                    pass
    except urllib.error.HTTPError as e:
        print(f"  ERROR chunk {i}: {e.code} {e.read().decode()[:200]}")

print(f"\nTagged from NULL: {updated_null}")

# Also try non-null, non-N4 (e.g. tagged as N3/N5 but we want N4)
# Skipping that — we don't want to change N3/N5 classifications
print("\nNow running export to check how many are now available...")
