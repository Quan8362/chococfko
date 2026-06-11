# -*- coding: utf-8 -*-
"""Query staging for untagged pending entries with short/simple meaning_en
   that could be N4-level vocabulary. Writes results to a file."""
import urllib.request, json, re

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
OUT_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n4-candidates.txt"

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
}

# Fetch multiple pages of untagged pending entries
all_entries = []
for offset in range(0, 3000, 300):
    url = (SUPABASE_URL + "/rest/v1/japanese_raw_jmdict"
           + "?jlpt_level=is.null"
           + "&converted_status=eq.pending"
           + "&select=word,reading,meaning_en,pos,ent_seq"
           + f"&limit=300&offset={offset}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if not data:
        break
    all_entries.extend(data)
    print(f"Fetched offset {offset}: {len(data)} entries (total: {len(all_entries)})")

# Detect katakana-only (loanwords - skip)
def is_katakana_only(s):
    return bool(re.match(r'^[゠-ヿー]+$', s))

# Filter for likely N4 vocabulary:
# - Has kanji (not katakana-only loanwords)
# - meaning_en not too complex
# - word length 1-4 kanji
def looks_n4(e):
    word = e.get("word","")
    reading = e.get("reading","")
    raw = e.get("meaning_en","")
    # meaning_en may be list or string
    if isinstance(raw, list):
        meaning = " | ".join(str(x) for x in raw)
    else:
        meaning = str(raw) if raw else ""
    if not word or not meaning:
        return False
    # Skip katakana-only loanwords
    if is_katakana_only(word):
        return False
    # Skip very long words
    if len(word) > 6:
        return False
    # Skip if meaning is very technical/niche
    technical_skip = ["(linguistics)", "botany", "zoology", "chemistry", "physics",
                      "biology", "anatomy", "mathematics", "music", "slang", "vulgar",
                      "archaism", "obsolete", "rare", "archaic", "poetic", "literary"]
    for t in technical_skip:
        if t.lower() in meaning.lower():
            return False
    return True

candidates = [e for e in all_entries if looks_n4(e)]
print(f"\nTotal fetched: {len(all_entries)}")
print(f"N4 candidates: {len(candidates)}")

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(f"Total fetched: {len(all_entries)}, N4 candidates: {len(candidates)}\n\n")
    for e in candidates[:300]:
        raw = e.get("meaning_en","")
        m = " | ".join(str(x) for x in raw) if isinstance(raw, list) else str(raw)
        f.write(f"{e['word']}\t{e['reading']}\t{e['ent_seq']}\t{m[:100]}\n")

print(f"Written to {OUT_FILE}")
