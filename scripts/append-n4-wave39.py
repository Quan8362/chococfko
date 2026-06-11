# -*- coding: utf-8 -*-
"""Appends Wave 39 to jlpt-n4-vocab.csv.
Focus: cooking verbs, Japanese culture/arts, building parts.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE39 = [
    ("# ===== Wave 39: Cooking Verbs =====", None, None),
    ("刻む", "きざむ", "N4"),
    ("剥く", "むく", "N4"),
    ("砕く", "くだく", "N4"),
    ("凍る", "こおる", "N4"),
    ("沸く", "わく", "N4"),
    ("溶ける", "とける", "N4"),
    ("冷ます", "さます", "N4"),
    ("注ぐ", "そそぐ", "N4"),
    ("# ===== Wave 39: Japanese Culture / Arts =====", None, None),
    ("仏壇", "ぶつだん", "N4"),
    ("鳥居", "とりい", "N4"),
    ("武道", "ぶどう", "N4"),
    ("落語", "らくご", "N4"),
    ("茶道", "さどう", "N4"),
    ("花道", "かどう", "N4"),
    ("能", "のう", "N4"),
    # ("歌舞伎", "かぶき", "N4"),  # likely already in
    ("# ===== Wave 39: Building / Architecture =====", None, None),
    ("天井", "てんじょう", "N4"),
    ("柱", "はしら", "N4"),
    ("外壁", "がいへき", "N4"),
    ("土台", "どだい", "N4"),
    ("屋根裏", "やねうら", "N4"),
    ("# ===== Wave 39: Animals / Counters =====", None, None),
    ("子犬", "こいぬ", "N4"),
    ("子猫", "こねこ", "N4"),
    ("子鳥", "こどり", "N4"),
    ("仔牛", "こうし", "N4"),
    ("子羊", "こひつじ", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE39:
    if word.startswith("#"):
        lines_to_add.append(f"{word},,\n")
    elif word is not None and word not in existing:
        lines_to_add.append(f"{word},{reading},{level}\n")
        added += 1
    elif word is not None:
        skipped += 1

with open(CSV_FILE, "a", encoding="utf-8", newline="") as f:
    f.write("\n")
    f.writelines(lines_to_add)

print(f"Added {added} new entries, skipped {skipped} duplicates")
