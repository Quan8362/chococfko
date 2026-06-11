# -*- coding: utf-8 -*-
"""Check staging: how many N3-tagged entries exist, and probe NULL entries for N3 vocabulary."""
import urllib.request, json

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Prefer": "count=exact", "Range": "0-0"}

# Check existing N3-tagged entries
url = SUPABASE_URL + "/rest/v1/japanese_raw_jmdict?jlpt_level=eq.N3"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req) as r:
    cr = r.headers.get("Content-Range", "")
    n3_count = cr.split("/")[1] if "/" in cr else "?"
print(f"Staging entries already tagged N3: {n3_count}")

# Check NULL pending entries
url2 = SUPABASE_URL + "/rest/v1/japanese_raw_jmdict?jlpt_level=is.null&converted_status=eq.pending"
req2 = urllib.request.Request(url2, headers=HEADERS)
with urllib.request.urlopen(req2) as r:
    cr2 = r.headers.get("Content-Range", "")
    null_count = cr2.split("/")[1] if "/" in cr2 else "?"
print(f"Staging entries untagged (NULL, pending): {null_count}")

# Check N3-tagged in japanese_words
url3 = SUPABASE_URL + "/rest/v1/japanese_words?jlpt_level=eq.N3&review_status=eq.approved"
req3 = urllib.request.Request(url3, headers=HEADERS)
with urllib.request.urlopen(req3) as r:
    cr3 = r.headers.get("Content-Range", "")
    jw_n3 = cr3.split("/")[1] if "/" in cr3 else "?"
print(f"japanese_words approved N3 entries: {jw_n3}")
