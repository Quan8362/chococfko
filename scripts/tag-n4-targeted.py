# -*- coding: utf-8 -*-
"""
Tags specific words as N4 in japanese_raw_jmdict via targeted REST queries.
Reads from jlpt-n4-vocab.csv, finds untagged entries in staging, patches them.
Does targeted per-word queries instead of fetching entire staging table.
"""

import csv, urllib.request, urllib.error, json, sys

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
ANON_KEY = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] if "NEXT_PUBLIC_SUPABASE_ANON_KEY" in env else env.get("SUPABASE_SERVICE_ROLE_KEY", "")
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

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
        reading = row[1].strip() if len(row) > 1 else ""
        level = row[2].strip() if len(row) > 2 else "N4"
        if level == "N4":
            n4_words.append((word, reading))

print(f"Total N4 words in CSV: {len(n4_words)}")

# Process in chunks of 50 words at a time using .in() filter
updated = 0
failed = 0
skipped = 0

CHUNK = 40
for i in range(0, len(n4_words), CHUNK):
    batch = n4_words[i:i+CHUNK]
    words_only = [w for w, r in batch]

    # Build IN filter - URL-encode as needed
    words_param = "(" + ",".join(w for w in words_only) + ")"

    # First check which ones need updating (no jlpt_level or jlpt_level != N4)
    # Use a PATCH with filter: word in list AND jlpt_level is null or != N4
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?word=in." + urllib.request.quote(words_param)
           + "&jlpt_level=not.eq.N4")

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
            # Content-Range: */N means N rows updated
            if "/" in content_range:
                count_str = content_range.split("/")[-1]
                try:
                    count = int(count_str)
                    updated += count
                except ValueError:
                    pass
        if (i // CHUNK) % 10 == 0:
            print(f"  Chunk {i//CHUNK}: processed {min(i+CHUNK, len(n4_words))}/{len(n4_words)} words, updated so far: {updated}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ERROR chunk {i}: {e.code} {body[:200]}")
        failed += 1

print(f"\nDone. Updated: {updated}, Failed chunks: {failed}")
