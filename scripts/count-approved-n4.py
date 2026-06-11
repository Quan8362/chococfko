# -*- coding: utf-8 -*-
import urllib.request, json

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

url = (env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
       + "?jlpt_level=eq.N4&review_status=eq.approved&select=id")
req = urllib.request.Request(url, headers={
    "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
    "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
    "Prefer": "count=exact",
    "Range": "0-0"
})
with urllib.request.urlopen(req) as r:
    content_range = r.headers.get("Content-Range", "")
    print(f"Content-Range: {content_range}")
    # Content-Range format: 0-0/TOTAL
    if "/" in content_range:
        total = content_range.split("/")[1]
        print(f"Total approved N4 words: {total}")
