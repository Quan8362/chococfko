# -*- coding: utf-8 -*-
"""Appends Wave 15 — taku/tatsu/datsu groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE15 = [
    ("# ===== Wave 15: Table / Excellence =====", None, None),
    ("題目", "だいもく", "N3"),
    ("卓越", "たくえつ", "N3"),
    ("卓球", "たっきゅう", "N3"),
    ("# ===== Wave 15: Home delivery / Residential =====", None, None),
    ("宅地", "たくち", "N3"),
    ("宅配", "たくはい", "N3"),
    ("宅配便", "たくはいびん", "N3"),
    ("託児所", "たくじしょ", "N3"),
    ("# ===== Wave 15: Food / Nature =====", None, None),
    ("沢庵", "たくあん", "N3"),
    ("濁流", "だくりゅう", "N3"),
    ("凧揚げ", "たこあげ", "N3"),
    ("# ===== Wave 15: Choice =====", None, None),
    ("択一", "たくいつ", "N3"),
    ("# ===== Wave 15: Reach / Master =====", None, None),
    ("但し", "ただし", "N3"),
    ("達する", "たっする", "N3"),
    ("達人", "たつじん", "N3"),
    ("# ===== Wave 15: Seize / Escape =====", None, None),
    ("奪回", "だっかい", "N3"),
    ("奪還", "だっかん", "N3"),
    ("奪取", "だっしゅ", "N3"),
    ("脱却", "だっきゃく", "N3"),
    ("脱臼", "だっきゅう", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE15:
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
