# -*- coding: utf-8 -*-
"""Quick probe for N4 candidates in ent_seq 1252000-1360000."""
import urllib.request, json, re

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
OUT_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n4-wave50-candidates.txt"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY}

def is_katakana_only(s):
    return bool(re.match(r'^[゠-ヿー]+$', s))

def get_meaning(e):
    raw = e.get("meaning_en", "")
    return " | ".join(str(x) for x in raw) if isinstance(raw, list) else str(raw)

all_entries = []
for batch_start in range(1252000, 1370000, 50000):
    batch_end = batch_start + 50000
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + f"?jlpt_level=is.null&converted_status=eq.pending"
           + f"&ent_seq=gte.{batch_start}&ent_seq=lt.{batch_end}"
           + "&select=word,reading,meaning_en,pos,ent_seq"
           + "&limit=300&order=ent_seq.asc")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    good = [e for e in data
            if e.get("word") and get_meaning(e) and get_meaning(e) != "None"
            and not is_katakana_only(e.get("word", ""))
            and len(e.get("word", "")) <= 5]
    all_entries.extend(good)

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(f"Total: {len(all_entries)}\n\n")
    for e in all_entries[:100]:
        m = get_meaning(e)
        f.write(f"{e['word']}\t{e['reading']}\t{e['ent_seq']}\t{m[:100]}\n")

print(f"Written {len(all_entries)} candidates to {OUT_FILE}")
