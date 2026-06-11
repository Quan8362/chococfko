# -*- coding: utf-8 -*-
"""Appends Wave 36 to jlpt-n4-vocab.csv.
Focus: technology, school subjects, music, sports.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE36 = [
    ("# ===== Wave 36: Technology / Digital =====", None, None),
    ("充電", "じゅうでん", "N4"),
    ("充電器", "じゅうでんき", "N4"),
    ("接続", "せつぞく", "N4"),
    ("設定", "せってい", "N4"),
    ("更新", "こうしん", "N4"),
    ("削除", "さくじょ", "N4"),
    ("保存", "ほぞん", "N4"),
    ("検索", "けんさく", "N4"),
    ("登録", "とうろく", "N4"),
    ("# ===== Wave 36: School Subjects =====", None, None),
    ("国語", "こくご", "N4"),
    ("理科", "りか", "N4"),
    ("道徳", "どうとく", "N4"),
    ("体育", "たいいく", "N4"),
    ("算数", "さんすう", "N4"),
    ("# ===== Wave 36: Music =====", None, None),
    ("楽器", "がっき", "N4"),
    ("演奏", "えんそう", "N4"),
    ("作曲", "さっきょく", "N4"),
    ("歌詞", "かし", "N4"),
    ("合唱", "がっしょう", "N4"),
    ("指揮", "しき", "N4"),
    ("# ===== Wave 36: Sports / Exercise =====", None, None),
    ("体操", "たいそう", "N4"),
    ("運動会", "うんどうかい", "N4"),
    ("水泳", "すいえい", "N4"),
    ("柔道", "じゅうどう", "N4"),
    ("剣道", "けんどう", "N4"),
    ("相撲", "すもう", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE36:
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
