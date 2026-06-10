# -*- coding: utf-8 -*-
import csv, urllib.request, urllib.error, json

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-004.csv"
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

ids_in = "(" + ",".join(source_ids) + ")"
url = (env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
       + f"?source_id=in.{ids_in}&review_status=eq.ai_draft&source=eq.jmdict")
req = urllib.request.Request(
    url,
    data=json.dumps({"review_status": "approved", "is_published": True}).encode(),
    method="PATCH",
    headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
             "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
             "Content-Type": "application/json", "Prefer": "return=representation"})
with urllib.request.urlopen(req) as r:
    count = len(json.loads(r.read()))
    print(f"Approved: {count}")
