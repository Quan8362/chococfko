# -*- coding: utf-8 -*-
"""Find fresh N3 candidates: words in japanese_raw_jmdict tagged N3 that are
NOT yet present in japanese_words (by word+reading). Emits a TSV for VI authoring.
Output: scripts/_n3-fresh.tsv  (word, reading, ent_seq, pos, meaning_en)
"""
import os, json, urllib.request, urllib.parse, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(__file__)
env = {}
with open(os.path.join(HERE, "..", ".env.local"), encoding="utf-8") as f:
    for line in f:
        line=line.strip()
        if "=" in line and not line.startswith("#"):
            k,v=line.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEAD)) as r:
        return r.read(), r.headers

def get_json(url):
    b,_=get(url); return json.loads(b)

def count(table, filt):
    url=f"{URL}/rest/v1/{table}?select=ent_seq&{filt}"
    req=urllib.request.Request(url, method="HEAD", headers={**HEAD,"Prefer":"count=exact","Range":"0-0"})
    with urllib.request.urlopen(req) as r:
        return int(r.headers.get("Content-Range","*/0").split("/")[-1])

# how is jlpt_level distributed in raw?
print("raw jmdict jlpt_level counts:")
for lv in ["N5","N4","N3","N2","N1"]:
    try:
        c=count("japanese_raw_jmdict", f"jlpt_level=eq.{lv}")
    except Exception as e:
        c=f"ERR {e}"
    print(f"  {lv}: {c}")

# fetch all raw N3 rows
raw=[]
off=0
while True:
    page=get_json(f"{URL}/rest/v1/japanese_raw_jmdict?select=ent_seq,word,reading,pos,meaning_en,converted_status&jlpt_level=eq.N3&order=ent_seq.asc&limit=1000&offset={off}")
    if not page: break
    raw.extend(page); off+=1000
    if len(page)<1000: break
print(f"\nraw N3 rows fetched: {len(raw)}")

# existing japanese_words keys (word+reading) — fetch all words+readings (any level)
existing=set()
off=0
while True:
    page=get_json(f"{URL}/rest/v1/japanese_words?select=word,reading&limit=1000&offset={off}")
    if not page: break
    for r in page: existing.add((r["word"], r.get("reading")))
    off+=1000
    if len(page)<1000: break
print(f"japanese_words total rows: {len(existing)}")

def ms(m): return " | ".join(map(str,m)) if isinstance(m,list) else str(m or "")
def ps(p): return "|".join(map(str,p)) if isinstance(p,list) else str(p or "")

fresh=[]
for r in raw:
    key=(r.get("word"), r.get("reading"))
    if key not in existing:
        fresh.append(r)

OUT=os.path.join(HERE,"_n3-fresh.tsv")
with open(OUT,"w",encoding="utf-8",newline="\n") as f:
    for r in fresh:
        f.write("\t".join([r.get("word") or "", r.get("reading") or "", str(r.get("ent_seq") or ""),
                           ps(r.get("pos")), ms(r.get("meaning_en"))])+"\n")
print(f"\nFRESH N3 candidates (raw N3 not in japanese_words): {len(fresh)}")
print(f"written: {OUT}")
