# -*- coding: utf-8 -*-
"""Given a curated (word, expected_reading) candidate list, report which are
fresh (not in japanese_words at any level) and look up ent_seq/pos/meaning_en
from japanese_raw_jmdict matching the expected reading.
Output: scripts/_n3-cand.tsv  (status, word, reading, ent_seq, pos, meaning_en)
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
def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEAD)) as r:
        return json.loads(r.read())
def ms(m): return " | ".join(map(str,m)) if isinstance(m,list) else str(m or "")
def ps(p): return "|".join(map(str,p)) if isinstance(p,list) else str(p or "")

# (word, expected_reading)
CAND = [
    ("曖昧","あいまい"),("抱く","いだく"),("挑む","いどむ"),("補う","おぎなう"),("脅す","おどす"),
    ("掲げる","かかげる"),("偏る","かたよる"),("刻む","きざむ"),("砕く","くだく"),("削る","けずる"),
    ("試みる","こころみる"),("遮る","さえぎる"),("逆らう","さからう"),("探る","さぐる"),("迫る","せまる"),
    ("蓄える","たくわえる"),("保つ","たもつ"),("縮む","ちぢむ"),("尽くす","つくす"),("継ぐ","つぐ"),
    ("募る","つのる"),("伴う","ともなう"),("眺める","ながめる"),("握る","にぎる"),("狙う","ねらう"),
    ("臨む","のぞむ"),("省く","はぶく"),("控える","ひかえる"),("含む","ふくむ"),("隔てる","へだてる"),
    ("招く","まねく"),("乱れる","みだれる"),("催す","もよおす"),("養う","やしなう"),("譲る","ゆずる"),
    ("装う","よそおう"),("詫びる","わびる"),("敬う","うやまう"),("承る","うけたまわる"),("訪れる","おとずれる"),
    ("怠る","おこたる"),("脅かす","おびやかす"),("陥る","おちいる"),("及ぼす","およぼす"),("顧みる","かえりみる"),
    ("輝く","かがやく"),("傾く","かたむく"),("構える","かまえる"),("枯れる","かれる"),("競う","きそう"),
    ("朽ちる","くちる"),("覆す","くつがえす"),("企てる","くわだてる"),("削除","さくじょ"),("妨げる","さまたげる"),
    ("授ける","さずける"),("強いる","しいる"),("沈める","しずめる"),("従う","したがう"),("退く","しりぞく"),
    ("据える","すえる"),("廃れる","すたれる"),("接する","せっする"),("攻める","せめる"),("反らす","そらす"),
    ("耐える","たえる"),("漂う","ただよう"),("費やす","ついやす"),("仕える","つかえる"),("償う","つぐなう"),
    ("貫く","つらぬく"),("照らす","てらす"),("尊ぶ","とうとぶ"),("遂げる","とげる"),("滞る","とどこおる"),
    ("嘆く","なげく"),("怠ける","なまける"),("悩ます","なやます"),("担う","になう"),("にじむ","にじむ"),
    ("覗く","のぞく"),("罵る","ののしる"),("映える","はえる"),("励む","はげむ"),("阻む","はばむ"),
    ("阻止","そし"),("漠然","ばくぜん"),("頻繁","ひんぱん"),("円滑","えんかつ"),("巧み","たくみ"),
    ("immune","めんえき"),("免疫","めんえき"),("矛盾","むじゅん"),("妥協","だきょう"),("把握","はあく"),
    ("該当","がいとう"),("譲歩","じょうほ"),("是非","ぜひ"),("merge","がっぺい"),("合併","がっぺい"),
    ("促進","そくしん"),("怠慢","たいまん"),("надо","x"),("徹底","てってい"),("妥当","だとう"),
]

# dedup
seen=set(); cand=[]
for w,r in CAND:
    if (w,r) in seen: continue
    seen.add((w,r)); cand.append((w,r))

# existing keys
existing=set()
off=0
while True:
    page=get_json(f"{URL}/rest/v1/japanese_words?select=word,reading&limit=1000&offset={off}")
    if not page: break
    for r in page: existing.add((r["word"], r.get("reading")))
    off+=1000
    if len(page)<1000: break

OUT=os.path.join(HERE,"_n3-cand.tsv")
fresh=0; taken=0; notfound=0
lines=[]
words=[w for w,_ in cand]
# fetch raw rows for these words
raw={}
for i in range(0,len(words),40):
    chunk=words[i:i+40]
    q=",".join('"'+w+'"' for w in chunk)
    url=f"{URL}/rest/v1/japanese_raw_jmdict?select=ent_seq,word,reading,pos,meaning_en&word=in.("+urllib.parse.quote(q)+")"
    for r in get_json(url):
        raw.setdefault(r["word"], []).append(r)

for w,rd in cand:
    if (w,rd) in existing:
        taken+=1; lines.append(("TAKEN",w,rd,"","","")); continue
    # find raw row with matching reading
    match=None
    for r in raw.get(w,[]):
        if r.get("reading")==rd: match=r; break
    if not match and raw.get(w):
        match=raw[w][0]  # fallback first
    if match:
        fresh+=1
        lines.append(("FRESH",w,match.get("reading") or rd,str(match.get("ent_seq") or ""),ps(match.get("pos")),ms(match.get("meaning_en"))))
    else:
        notfound+=1
        lines.append(("NORAW",w,rd,"","",""))

with open(OUT,"w",encoding="utf-8",newline="\n") as f:
    for t in lines:
        f.write("\t".join(t)+"\n")
print(f"candidates: {len(cand)} | FRESH(usable): {fresh} | TAKEN(already in DB): {taken} | NORAW(no jmdict match): {notfound}")
print(f"written: {OUT}")
