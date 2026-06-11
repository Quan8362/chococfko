# -*- coding: utf-8 -*-
"""Probe staging for common-vocabulary candidates by ent_seq range 1200000-1600000."""
import urllib.request, json, re

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
OUT_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n4-candidates4.txt"

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
    raw = e.get("meaning_en","")
    return " | ".join(str(x) for x in raw) if isinstance(raw, list) else str(raw)

def looks_n4(e):
    word = e.get("word","")
    meaning = get_meaning(e)
    if not word or not meaning or meaning == "None":
        return False
    if is_katakana_only(word):
        return False
    if len(word) > 5:
        return False
    skip = ["(linguistics)", "botany", "zoology", "chemistry", "physics",
            "biology", "anatomy", "mathematics", "slang", "vulgar",
            "archaism", "archaic", "poetic", "literary", "obsolete",
            "rare term", "rare word", "rare reading"]
    for s in skip:
        if s.lower() in meaning.lower():
            return False
    return True

# Query by ent_seq range using PostgREST filters
all_entries = []
for batch_start in range(1200000, 1600000, 50000):
    batch_end = batch_start + 50000
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + f"?jlpt_level=is.null&converted_status=eq.pending"
           + f"&ent_seq=gte.{batch_start}&ent_seq=lt.{batch_end}"
           + "&select=word,reading,meaning_en,pos,ent_seq"
           + "&limit=300&order=ent_seq.asc")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    candidates_here = [e for e in data if looks_n4(e)]
    all_entries.extend(candidates_here)
    print(f"ent_seq {batch_start}-{batch_end}: {len(data)} entries, {len(candidates_here)} candidates")

print(f"\nTotal candidates: {len(all_entries)}")

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(f"Total candidates: {len(all_entries)}\n\n")
    for e in all_entries[:500]:
        m = get_meaning(e)
        f.write(f"{e['word']}\t{e['reading']}\t{e['ent_seq']}\t{m[:100]}\n")
print(f"Written to {OUT_FILE}")
