# -*- coding: utf-8 -*-
"""Check status of N3 words that weren't found as NULL/pending in staging."""
import urllib.request, json, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ENV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\.env.local"
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

# Words that weren't found as null/pending
words = [
    "解決","原因","結果","影響","変化","発展","研究","調査","報告","議論",
    "提案","実施","目標","達成","向上","対策","状況","重要","正確","明確",
    "具体的","一般的","特徴","様々","比較","分析","判断","表現","場面",
    "感動","怒り","悲しみ","期待","失望","誤解","記憶","信頼","批判","賛成",
    "主張","証明","観察","実験"
]

print("word | staging_status | jlpt_in_staging | in_japanese_words")
for word in words:
    # Check staging
    url = (URL + "/rest/v1/japanese_raw_jmdict"
           + "?word=eq." + urllib.request.quote(word)
           + "&select=word,jlpt_level,converted_status&limit=3")
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req) as r:
        staging = json.loads(r.read())

    # Check japanese_words
    url2 = URL + "/rest/v1/japanese_words?word=eq." + urllib.request.quote(word) + "&select=word,jlpt_level,source,review_status&limit=3"
    req2 = urllib.request.Request(url2, headers=H)
    with urllib.request.urlopen(req2) as r:
        jw = json.loads(r.read())

    s_info = [(e.get("jlpt_level"), e.get("converted_status")) for e in staging]
    jw_info = [(e.get("jlpt_level"), e.get("source"), e.get("review_status")) for e in jw]
    print(f"  {word}: staging={s_info}, japanese_words={jw_info}")
