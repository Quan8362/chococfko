# -*- coding: utf-8 -*-
import csv, urllib.request, urllib.error, json

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-049.csv"
ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

source_ids = [row["source_id"] for row in csv.DictReader(open(CSV_FILE, encoding="utf-8", newline=""))]
print(f"Approving {len(source_ids)} rows")

total = 0
for i in range(0, len(source_ids), 80):
    chunk = source_ids[i:i+80]
    url = (env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
           + "?source_id=in.(" + ",".join(chunk) + ")"
           + "&review_status=eq.ai_draft&source=eq.jmdict")
    req = urllib.request.Request(
        url,
        data=json.dumps({"review_status": "approved", "is_published": True}).encode(),
        method="PATCH",
        headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
                 "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    with urllib.request.urlopen(req) as r:
        count = len(json.loads(r.read()))
        total += count
        print(f"  Chunk {i}: approved {count}")

print(f"Total approved: {total}")
