# -*- coding: utf-8 -*-
"""Reusable candidate checker.
Reads candidates from a TSV (word<TAB>reading per line) given as argv[1].
Reports which are fresh (not in japanese_words at any level) and looks up
ent_seq/pos/meaning_en from japanese_raw_jmdict matching the expected reading.
Writes <input>.out.tsv with: status, word, reading, ent_seq, pos, meaning_en
"""
import os, sys, json, urllib.request, urllib.parse, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(__file__)
INP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "_cand-in.tsv")
env = {}
with open(os.path.join(HERE, "..", ".env.local"), encoding="utf-8") as f:
    for l in f:
        if "=" in l and not l.strip().startswith("#"):
            k, v = l.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
U = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); K = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": K, "Authorization": "Bearer " + K}
def gj(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=H)) as r:
        return json.loads(r.read())
def ms(m): return " | ".join(map(str, m)) if isinstance(m, list) else str(m or "")
def ps(p): return "|".join(map(str, p)) if isinstance(p, list) else str(p or "")

cand = []
seen = set()
with open(INP, encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"): continue
        parts = line.split("\t")
        w = parts[0].strip(); rd = parts[1].strip() if len(parts) > 1 else ""
        if (w, rd) in seen: continue
        seen.add((w, rd)); cand.append((w, rd))

existing = set()
off = 0
while True:
    page = gj(f"{U}/rest/v1/japanese_words?select=word,reading&limit=1000&offset={off}")
    if not page: break
    for r in page: existing.add((r["word"], r.get("reading")))
    off += 1000
    if len(page) < 1000: break

words = [w for w, _ in cand]
raw = {}
for i in range(0, len(words), 40):
    q = ",".join('"' + w + '"' for w in words[i:i+40])
    for r in gj(f"{U}/rest/v1/japanese_raw_jmdict?select=ent_seq,word,reading,pos,meaning_en&word=in.(" + urllib.parse.quote(q) + ")"):
        raw.setdefault(r["word"], []).append(r)

OUT = INP + ".out.tsv"
fresh = taken = noraw = 0
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    for w, rd in cand:
        if (w, rd) in existing:
            taken += 1; f.write("\t".join(["TAKEN", w, rd, "", "", ""]) + "\n"); continue
        match = None
        for r in raw.get(w, []):
            if r.get("reading") == rd: match = r; break
        if not match and raw.get(w):
            # only fallback if word has a single raw entry (avoid wrong homonym)
            if len(raw[w]) == 1: match = raw[w][0]
        if match:
            fresh += 1
            f.write("\t".join(["FRESH", w, match.get("reading") or rd, str(match.get("ent_seq") or ""),
                               ps(match.get("pos")), ms(match.get("meaning_en"))]) + "\n")
        else:
            noraw += 1
            f.write("\t".join(["NORAW", w, rd, "", "", ""]) + "\n")
print(f"candidates: {len(cand)} | FRESH: {fresh} | TAKEN: {taken} | NORAW/ambiguous: {noraw}")
print(f"written: {OUT}")
