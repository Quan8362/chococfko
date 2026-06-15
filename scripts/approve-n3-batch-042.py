# -*- coding: utf-8 -*-
"""Approve + publish wave 042 ai_draft rows (matched by source_id, guarded to jmdict ai_draft)."""
import os, csv, urllib.request, json

HERE = os.path.dirname(__file__)
CSV_FILE = os.path.join(HERE, "..", "data", "japanese", "jmdict-n3-vi-ready-042.csv")
ENV_FILE = os.path.join(HERE, "..", ".env.local")

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

source_ids = [row["source_id"] for row in csv.DictReader(open(CSV_FILE, encoding="utf-8", newline=""))]
print(f"Approving up to {len(source_ids)} N3 entries (wave 042, only ai_draft+jmdict get patched)...")

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
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(req) as r:
        count = len(json.loads(r.read()))
        print(f"  chunk {i//80+1}: approved {count}")
        total += count

print(f"Done. Total approved this wave: {total}")
