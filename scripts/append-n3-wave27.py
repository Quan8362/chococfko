# -*- coding: utf-8 -*-
"""Appends Wave 27 — burn/seasons/formal/household/cultural."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE27 = [
    ("# ===== Wave 27: Time / seasons =====", None, None),
    ("年々", "ねんねん", "N3"),
    ("年月", "としつき", "N3"),
    ("梅雨", "つゆ", "N3"),
    ("半年", "はんとし", "N3"),
    ("# ===== Wave 27: Actions / expressions =====", None, None),
    ("燃やす", "もやす", "N3"),
    ("避ける", "さける", "N3"),
    ("描く", "えがく", "N3"),
    ("侮る", "あなどる", "N3"),
    ("如何", "いかん", "N3"),
    ("# ===== Wave 27: Formal / institutions =====", None, None),
    ("発足", "ほっそく", "N3"),
    ("文書", "ぶんしょ", "N3"),
    ("分泌", "ぶんぴつ", "N3"),
    ("不定", "ふてい", "N3"),
    ("# ===== Wave 27: People / body / culture =====", None, None),
    ("夫婦", "ふうふ", "N3"),
    ("武士", "ぶし", "N3"),
    ("白髪", "しらが", "N3"),
    ("肌寒い", "はださむい", "N3"),
    ("拍子", "ひょうし", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE27:
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
