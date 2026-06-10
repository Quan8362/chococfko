# -*- coding: utf-8 -*-
import csv, sys, urllib.request, urllib.error, json

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-003.csv"
ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

source_ids = []
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f):
        source_ids.append(row["source_id"])

print(f"Source IDs to approve: {len(source_ids)}")
total = 0
for i in range(0, len(source_ids), 80):
    chunk = source_ids[i:i+80]
    url = (SUPABASE_URL.rstrip("/") + "/rest/v1/japanese_words"
           + f"?source_id=in.({',' .join(chunk)})"
           + "&review_status=eq.ai_draft&source=eq.jmdict")
    req = urllib.request.Request(
        url,
        data=json.dumps({"review_status": "approved", "is_published": True}).encode(),
        method="PATCH",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        with urllib.request.urlopen(req) as r:
            count = len(json.loads(r.read()))
            total += count
            print(f"  Chunk {i}: approved {count}")
    except urllib.error.HTTPError as e:
        print(f"  ERROR: {e.code} {e.read().decode()[:200]}")
print(f"Total approved: {total}")
