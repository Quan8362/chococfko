# -*- coding: utf-8 -*-
"""Check how many N4 staging entries are available for export."""

import urllib.request, urllib.error, json

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
    "Prefer": "count=exact",
}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
        count_range = r.headers.get("Content-Range", "?/?")
        return data, count_range

# Count total N4 tagged in staging
url = SUPABASE_URL + "/rest/v1/japanese_raw_jmdict?jlpt_level=eq.N4&select=id&limit=1"
_, cr = fetch(url)
print(f"N4 tagged in staging: {cr}")

# Count N4 tagged AND not converted
url = SUPABASE_URL + "/rest/v1/japanese_raw_jmdict?jlpt_level=eq.N4&is_converted=not.eq.true&select=id&limit=1"
_, cr = fetch(url)
print(f"N4 tagged, NOT converted: {cr}")

# Count N4 tagged, not converted, meaning_en not empty
url = SUPABASE_URL + "/rest/v1/japanese_raw_jmdict?jlpt_level=eq.N4&is_converted=not.eq.true&meanings=not.eq.[]&select=id,word,meanings&limit=20"
data, cr = fetch(url)
print(f"N4, not converted, has meanings: {cr}")
print("Sample words:")
for row in data[:10]:
    print(f"  {row.get('word', '?')} — meanings length: {len(row.get('meanings', []))}")
