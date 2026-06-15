# -*- coding: utf-8 -*-
"""Reusable approver: approve+publish ai_draft jmdict rows whose source_id is in the
given ready CSV. Usage: python approve-wave.py <path-to-ready.csv>
Guarded: only rows with review_status='ai_draft' AND source='jmdict' are patched.
"""
import os, sys, csv, urllib.request, json
HERE = os.path.dirname(__file__)
CSV_FILE = sys.argv[1]
env = {}
with open(os.path.join(HERE, "..", ".env.local"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
source_ids = [r["source_id"] for r in csv.DictReader(open(CSV_FILE, encoding="utf-8", newline=""))]
print(f"Approving up to {len(source_ids)} entries from {os.path.basename(CSV_FILE)}...")
total = 0
for i in range(0, len(source_ids), 80):
    chunk = source_ids[i:i+80]
    url = (env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
           + "?source_id=in.(" + ",".join(chunk) + ")&review_status=eq.ai_draft&source=eq.jmdict")
    req = urllib.request.Request(url,
        data=json.dumps({"review_status": "approved", "is_published": True}).encode(),
        method="PATCH",
        headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
                 "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    with urllib.request.urlopen(req) as r:
        c = len(json.loads(r.read())); total += c
print(f"Done. Total approved: {total}")
