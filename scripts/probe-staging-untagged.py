# -*- coding: utf-8 -*-
"""Probe japanese_raw_jmdict for untagged (jlpt_level=null) pending entries."""
import urllib.request, json

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {
    "apikey": KEY,
    "Authorization": "Bearer " + KEY,
    "Content-Type": "application/json",
    "Prefer": "count=exact",
}

# Fetch untagged pending entries with some meaning_en content
url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
       + "?jlpt_level=is.null"
       + "&converted_status=eq.pending"
       + "&select=word,reading,meaning_en,pos"
       + "&limit=300"
       + "&offset=0")
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req) as r:
    total_count = r.headers.get("content-range", "?")
    data = json.loads(r.read())

print(f"Content-Range: {total_count}")
print(f"Fetched: {len(data)} entries\n")

# Show words with short meaning_en (simpler words, more likely N4)
simple = [(e["word"], e["reading"], e.get("meaning_en","")[:60])
          for e in data if e.get("meaning_en") and len(e.get("meaning_en","")) < 80]
print(f"Simple entries (meaning_en < 80 chars): {len(simple)}")
print()
for w, r_, m in simple[:100]:
    print(f"  {w} [{r_}] - {m}")
