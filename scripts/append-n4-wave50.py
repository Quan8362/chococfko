# -*- coding: utf-8 -*-
"""Appends Wave 50 to jlpt-n4-vocab.csv.
Focus: 警/軽 vocabulary — police/warning/light. Need just 6 more to reach 2,000.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE50 = [
    ("# ===== Wave 50: Police / Warning =====", None, None),
    ("警戒", "けいかい", "N4"),
    ("警官", "けいかん", "N4"),
    ("警告", "けいこく", "N4"),
    ("警察", "けいさつ", "N4"),
    ("警察署", "けいさつしょ", "N4"),
    ("警報", "けいほう", "N4"),
    ("警備", "けいび", "N4"),
    ("警護", "けいご", "N4"),
    ("# ===== Wave 50: Light / Mild =====", None, None),
    ("軽快", "けいかい", "N4"),
    ("軽視", "けいし", "N4"),
    ("軽傷", "けいしょう", "N4"),
    ("軽蔑", "けいべつ", "N4"),
    ("軽減", "けいげん", "N4"),
    ("軽装", "けいそう", "N4"),
    ("# ===== Wave 50: Calculate / Scheme =====", None, None),
    ("計略", "けいりゃく", "N4"),
    ("計器", "けいき", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE50:
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
