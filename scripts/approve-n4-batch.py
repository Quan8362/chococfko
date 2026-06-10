# -*- coding: utf-8 -*-
"""Approves ai_draft N4 words imported from a ready CSV via Supabase REST API."""

import csv, os, sys, urllib.request, urllib.error, json

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-001.csv"
ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"

# Read env
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY  = env.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: Missing SUPABASE_URL or SERVICE_KEY in .env.local")
    sys.exit(1)

# Read source_ids from CSV
source_ids = []
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        source_ids.append(row["source_id"])

print(f"Source IDs to approve: {len(source_ids)}")

# Chunk and approve
CHUNK = 80
total_approved = 0

for i in range(0, len(source_ids), CHUNK):
    chunk = source_ids[i:i+CHUNK]
    ids_in = "(" + ",".join(chunk) + ")"
    url = (SUPABASE_URL.rstrip("/")
           + "/rest/v1/japanese_words"
           + f"?source_id=in.{ids_in}"
           + "&review_status=eq.ai_draft"
           + "&source=eq.jmdict")
    payload = json.dumps({"review_status": "approved", "is_published": True}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="PATCH",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            rows = json.loads(body)
            count = len(rows)
            total_approved += count
            print(f"  Chunk {i}..{i+len(chunk)-1}: approved {count} rows")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"  ERROR chunk {i}: HTTP {e.code} — {body[:200]}")

print(f"\nTotal approved: {total_approved}")
