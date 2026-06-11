# -*- coding: utf-8 -*-
"""Probe staging for N4 candidates from offset 8000-14000."""
import urllib.request, json, re

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
OUT_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n4-candidates3.txt"

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

all_entries = []
for offset in range(8000, 14100, 300):
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?jlpt_level=is.null&converted_status=eq.pending"
           + "&select=word,reading,meaning_en,pos,ent_seq"
           + f"&limit=300&offset={offset}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if not data:
        break
    all_entries.extend(data)

def get_meaning(e):
    raw = e.get("meaning_en","")
    return " | ".join(str(x) for x in raw) if isinstance(raw, list) else str(raw)

def looks_n4(e):
    word = e.get("word","")
    meaning = get_meaning(e)
    if not word or not meaning or meaning == "None":
        return False
    if is_katakana_only(word):
        return False
    if len(word) > 6:
        return False
    skip = ["(linguistics)", "botany", "zoology", "chemistry", "physics",
            "biology", "anatomy", "mathematics", "slang", "vulgar",
            "archaism", "archaic", "poetic", "literary", "obsolete"]
    for s in skip:
        if s.lower() in meaning.lower():
            return False
    return True

candidates = [e for e in all_entries if looks_n4(e)]
print(f"Fetched: {len(all_entries)}, Candidates: {len(candidates)}")

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(f"Fetched: {len(all_entries)}, Candidates: {len(candidates)}\n\n")
    for e in candidates[:400]:
        m = get_meaning(e)
        f.write(f"{e['word']}\t{e['reading']}\t{e['ent_seq']}\t{m[:100]}\n")
print(f"Written to {OUT_FILE}")
