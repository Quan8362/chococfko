# -*- coding: utf-8 -*-
"""Appends Wave 19 — chikan/chuu-naka groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE19 = [
    ("# ===== Wave 19: Theft / Dementia =====", None, None),
    ("置き引き", "おきびき", "N3"),
    ("痴漢", "ちかん", "N3"),
    ("痴呆", "ちほう", "N3"),
    ("# ===== Wave 19: Middle Ages / Dropout / Interrupt =====", None, None),
    ("中心的", "ちゅうしんてき", "N3"),
    ("中世", "ちゅうせい", "N3"),
    ("中絶", "ちゅうぜつ", "N3"),
    ("中退", "ちゅうたい", "N3"),
    ("中断", "ちゅうだん", "N3"),
    ("中だるみ", "なかだるみ", "N3"),
    ("中庭", "なかにわ", "N3"),
    ("# ===== Wave 19: Halfway / Middle East / Poison =====", None, None),
    ("中途", "ちゅうと", "N3"),
    ("中東", "ちゅうとう", "N3"),
    ("中等", "ちゅうとう", "N3"),
    ("中毒", "ちゅうどく", "N3"),
    ("中南米", "ちゅうなんべい", "N3"),
    ("中入り", "なかいり", "N3"),
    ("中年", "ちゅうねん", "N3"),
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
