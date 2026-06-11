# -*- coding: utf-8 -*-
"""Appends Wave 19 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE19 = [
    ("# ===== Wave 19: Law / Rules =====", None, None),
    ("法律", "ほうりつ", "N4"),
    ("規則", "きそく", "N4"),
    ("規制", "きせい", "N4"),
    ("規約", "きやく", "N4"),
    ("禁止", "きんし", "N4"),
    ("義務", "ぎむ", "N4"),
    ("権利", "けんり", "N4"),
    ("責任", "せきにん", "N4"),
    ("違反", "いはん", "N4"),
    ("罰則", "ばっそく", "N4"),
    ("# ===== Wave 19: Research / Academic =====", None, None),
    ("実験", "じっけん", "N4"),
    ("観察", "かんさつ", "N4"),
    ("仮説", "かせつ", "N4"),
    ("検証", "けんしょう", "N4"),
    ("分析", "ぶんせき", "N4"),
    ("データ収集", "データしゅうしゅう", "N4"),
    ("統計", "とうけい", "N4"),
    ("論文", "ろんぶん", "N4"),
    ("引用", "いんよう", "N4"),
    ("# ===== Wave 19: Expressing Degrees =====", None, None),
    ("ほぼ", "ほぼ", "N4"),
    ("おおよそ", "おおよそ", "N4"),
    ("なるべく", "なるべく", "N4"),
    ("たいてい", "たいてい", "N4"),
    ("案外", "あんがい", "N4"),
    ("意外と", "いがいと", "N4"),
    ("いかにも", "いかにも", "N4"),
    ("さすが", "さすが", "N4"),
    ("# ===== Wave 19: Linking Words =====", None, None),
    ("そのため", "そのため", "N4"),
    ("したがって", "したがって", "N4"),
    ("そこで", "そこで", "N4"),
    ("その結果", "そのけっか", "N4"),
    ("それにもかかわらず", "それにもかかわらず", "N4"),
    ("ところが", "ところが", "N4"),
    ("それどころか", "それどころか", "N4"),
    ("一方で", "いっぽうで", "N4"),
    ("# ===== Wave 19: Describing Actions =====", None, None),
    ("焦る", "あせる", "N4"),
    ("迷う", "まよう", "N4"),
    ("慌てる", "あわてる", "N4"),
    ("驚く", "おどろく", "N4"),
    ("感心する", "かんしんする", "N4"),
    ("納得する", "なっとくする", "N4"),
    ("感謝する", "かんしゃする", "N4"),
    ("苦労する", "くろうする", "N4"),
    ("努力する", "どりょくする", "N4"),
    ("挑戦する", "ちょうせんする", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE19:
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
