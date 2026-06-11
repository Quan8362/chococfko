# -*- coding: utf-8 -*-
"""Tags N3 CSV words that are in staging with jlpt_level=NULL."""
import csv, urllib.request, urllib.error, json, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"
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

# Read N3 words from CSV
n3_words = []
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if not row or not row[0] or row[0].startswith("#"):
            continue
        word = row[0].strip()
        if len(row) > 2 and row[2].strip() == "N3":
            n3_words.append(word)

print(f"Total N3 words in CSV: {len(n3_words)}")

# Process in chunks — PATCH where jlpt_level IS NULL
updated_null = 0
CHUNK = 40
for i in range(0, len(n3_words), CHUNK):
    batch = n3_words[i:i+CHUNK]
    words_param = "(" + ",".join(batch) + ")"
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?word=in." + urllib.request.quote(words_param)
           + "&jlpt_level=is.null"
           + "&converted_status=eq.pending")
    req = urllib.request.Request(
        url,
        data=json.dumps({"jlpt_level": "N3"}).encode(),
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
print("\nNow running export to check how many are now available...")
