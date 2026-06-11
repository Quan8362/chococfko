# -*- coding: utf-8 -*-
"""Probe staging for N3-worthy candidates in ent_seq 1253000-1403000 (gap range)."""
import urllib.request, json, sys, io

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

START = 1253000
END   = 1403000
STEP  = 5000
MAX_MEANINGS = 6
results = []

out = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

for batch_start in range(START, END, STEP):
    batch_end = batch_start + STEP
    url = (URL + "/rest/v1/japanese_raw_jmdict"
           + f"?ent_seq=gte.{batch_start}&ent_seq=lt.{batch_end}"
           + "&converted_status=eq.pending"
           + "&select=ent_seq,word,reading,meaning_en"
           + "&limit=200")
    req = urllib.request.Request(url, headers={
        "apikey": KEY, "Authorization": "Bearer " + KEY
    })
    with urllib.request.urlopen(req) as r:
        rows = json.loads(r.read())

    for row in rows:
        meanings = row.get("meaning_en") or []
        if isinstance(meanings, list) and 1 <= len(meanings) <= MAX_MEANINGS:
            first_m = meanings[0] if meanings else ""
            results.append((row["ent_seq"], row["word"], row["reading"], first_m))
    out.write(f"Batch {batch_start}-{batch_end}: {len(rows)} rows\n")
    out.flush()

out.write(f"\nTotal candidates: {len(results)}\n")
with open(r"scripts/n3-candidates-5.txt", "w", encoding="utf-8") as f:
    f.write(f"Total candidates: {len(results)}\n\n")
    for ent, word, reading, meaning in results[:500]:
        f.write(f"{word}\t{reading}\t{ent}\t{meaning}\n")
out.write("Written to n3-candidates-5.txt\n")
