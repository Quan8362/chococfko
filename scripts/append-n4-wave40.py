# -*- coding: utf-8 -*-
"""Appends Wave 40 to jlpt-n4-vocab.csv.
Focus: transportation/travel, daily actions, body/health, environment.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE40 = [
    ("# ===== Wave 40: Transportation / Travel =====", None, None),
    ("乗り換え", "のりかえ", "N4"),
    ("乗り場", "のりば", "N4"),
    ("出発", "しゅっぱつ", "N4"),
    ("到着", "とうちゃく", "N4"),
    ("往復", "おうふく", "N4"),
    ("片道", "かたみち", "N4"),
    ("終点", "しゅうてん", "N4"),
    ("# ===== Wave 40: Daily Actions =====", None, None),
    ("着替える", "きがえる", "N4"),
    ("脱ぐ", "ぬぐ", "N4"),
    ("履く", "はく", "N4"),
    ("かぶる", "かぶる", "N4"),
    ("磨く", "みがく", "N4"),
    ("洗う", "あらう", "N4"),
    ("干す", "ほす", "N4"),
    ("畳む", "たたむ", "N4"),
    ("# ===== Wave 40: Body / Health =====", None, None),
    ("体重", "たいじゅう", "N4"),
    ("身長", "しんちょう", "N4"),
    ("血液", "けつえき", "N4"),
    ("骨", "ほね", "N4"),
    ("筋肉", "きんにく", "N4"),
    ("皮膚", "ひふ", "N4"),
    ("# ===== Wave 40: Environment / Nature =====", None, None),
    ("砂漠", "さばく", "N4"),
    ("森林", "しんりん", "N4"),
    ("湿気", "しっけ", "N4"),
    ("霧", "きり", "N4"),
    ("雷", "かみなり", "N4"),
    ("嵐", "あらし", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE40:
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
