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

url = (env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
       + "/rest/v1/japanese_words"
       + "?jlpt_level=eq.N3&review_status=eq.approved&select=id")
req = urllib.request.Request(url, headers={
    "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
    "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
    "Prefer": "count=exact",
    "Range": "0-0",
})
with urllib.request.urlopen(req) as r:
    cr = r.headers.get("Content-Range", "")
    total = cr.split("/")[-1] if "/" in cr else "?"
    print(f"Approved N3 words: {total}")
