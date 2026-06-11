# -*- coding: utf-8 -*-
"""Probe staging for N3-level candidates in ent_seq 1304000-2000000."""
import urllib.request, json, re

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
OUT_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n3-candidates-2.txt"

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY}

def is_katakana_only(s):
    return bool(re.match(r'^[゠-ヿー]+$', s))

def get_meaning(e):
    raw = e.get("meaning_en", "")
    return " | ".join(str(x) for x in raw) if isinstance(raw, list) else str(raw)

def is_good_n3(e):
    word = e.get("word", "")
    meaning = get_meaning(e)
    if not word or not meaning or meaning == "None":
        return False
    if is_katakana_only(word):
        return False
    if len(word) > 6:
        return False
    skip = ["botany", "zoology", "chemistry", "physics", "biology", "anatomy",
            "mathematics", "slang", "vulgar", "archaism", "archaic", "poetic",
            "literary", "obsolete", "rare term", "rare word", "economics term",
            "law term", "medicine term", "comp", "math", "elec", "silkworm",
            "sericulture", "oyster"]
    for s in skip:
        if s.lower() in meaning.lower():
            return False
    return True

all_entries = []
for batch_start in range(1304000, 2000000, 50000):
    batch_end = batch_start + 50000
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + f"?jlpt_level=is.null&converted_status=eq.pending"
           + f"&ent_seq=gte.{batch_start}&ent_seq=lt.{batch_end}"
           + "&select=word,reading,meaning_en,pos,ent_seq"
           + "&limit=200&order=ent_seq.asc")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    good = [e for e in data if is_good_n3(e)]
    all_entries.extend(good)
    print(f"  {batch_start}-{batch_end}: {len(data)} fetched, {len(good)} good")

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(f"Total candidates: {len(all_entries)}\n\n")
    for e in all_entries[:500]:
        m = get_meaning(e)
        f.write(f"{e['word']}\t{e['reading']}\t{e['ent_seq']}\t{m[:100]}\n")

print(f"Written {min(len(all_entries), 500)} candidates to {OUT_FILE} (total {len(all_entries)})")
