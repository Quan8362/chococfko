# -*- coding: utf-8 -*-
"""Appends Wave 2 to jlpt-n3-vocab.csv — business, society, process vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE2 = [
    ("# ===== Wave 2: Business / Organization =====", None, None),
    ("企業", "きぎょう", "N3"),
    ("業界", "ぎょうかい", "N3"),
    ("契約", "けいやく", "N3"),
    ("収入", "しゅうにゅう", "N3"),
    ("利益", "りえき", "N3"),
    ("損害", "そんがい", "N3"),
    ("申請", "しんせい", "N3"),
    ("許可", "きょか", "N3"),
    ("承認", "しょうにん", "N3"),
    ("否定", "ひてい", "N3"),
    ("肯定", "こうてい", "N3"),
    ("# ===== Wave 2: Society / Environment =====", None, None),
    ("世代", "せだい", "N3"),
    ("地域", "ちいき", "N3"),
    ("環境", "かんきょう", "N3"),
    ("資源", "しげん", "N3"),
    ("消費", "しょうひ", "N3"),
    ("生産", "せいさん", "N3"),
    ("輸出", "ゆしゅつ", "N3"),
    ("輸入", "ゆにゅう", "N3"),
    ("貿易", "ぼうえき", "N3"),
    ("政策", "せいさく", "N3"),
    ("制度", "せいど", "N3"),
    ("規制", "きせい", "N3"),
    ("条件", "じょうけん", "N3"),
    ("基準", "きじゅん", "N3"),
    ("# ===== Wave 2: Academic / Research =====", None, None),
    ("論文", "ろんぶん", "N3"),
    ("資料", "しりょう", "N3"),
    ("技能", "ぎのう", "N3"),
    ("才能", "さいのう", "N3"),
    ("学習", "がくしゅう", "N3"),
    ("# ===== Wave 2: Time / Process / Reason =====", None, None),
    ("期間", "きかん", "N3"),
    ("過程", "かてい", "N3"),
    ("手順", "てじゅん", "N3"),
    ("段階", "だんかい", "N3"),
    ("手段", "しゅだん", "N3"),
    ("方針", "ほうしん", "N3"),
    ("課題", "かだい", "N3"),
    ("根拠", "こんきょ", "N3"),
    ("前提", "ぜんてい", "N3"),
    ("事実", "じじつ", "N3"),
    ("# ===== Wave 2: Tendency / Attitude =====", None, None),
    ("傾向", "けいこう", "N3"),
    ("姿勢", "しせい", "N3"),
    ("意図", "いと", "N3"),
    ("認識", "にんしき", "N3"),
    ("指摘", "してき", "N3"),
    ("検討", "けんとう", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE2:
    if word.startswith("#"):
        lines_to_add.append(f"{word},,\n")
    elif word not in existing:
        lines_to_add.append(f"{word},{reading},{level}\n")
        added += 1
    else:
        skipped += 1

with open(CSV_FILE, "a", encoding="utf-8", newline="") as f:
    f.write("\n")
    f.writelines(lines_to_add)

print(f"Added {added} new entries, skipped {skipped} duplicates")
