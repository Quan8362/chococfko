# -*- coding: utf-8 -*-
"""Appends Wave 6 to jlpt-n3-vocab.csv — breath/restraint/foot/speed vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE6 = [
    ("# ===== Wave 6: Breath / Vitality =====", None, None),
    ("息継ぎ", "いきつぎ", "N3"),
    ("息切れ", "いきぎれ", "N3"),
    ("息抜き", "いきぬき", "N3"),
    ("息吹", "いぶき", "N3"),
    ("# ===== Wave 6: Moment / Restraint =====", None, None),
    ("つかの間", "つかのま", "N3"),
    ("束縛", "そくばく", "N3"),
    ("# ===== Wave 6: Footstep / Foundation =====", None, None),
    ("足音", "あしおと", "N3"),
    ("足腰", "あしこし", "N3"),
    ("足止め", "あしどめ", "N3"),
    ("足取り", "あしどり", "N3"),
    ("足場", "あしば", "N3"),
    ("足早", "あしばや", "N3"),
    ("足踏み", "あしぶみ", "N3"),
    ("足並み", "あしなみ", "N3"),
    ("# ===== Wave 6: Speed / Measurement =====", None, None),
    ("速やか", "すみやか", "N3"),
    ("速報", "そくほう", "N3"),
    ("速達", "そくたつ", "N3"),
    ("速記", "そっき", "N3"),
    ("測定", "そくてい", "N3"),
    ("測量", "そくりょう", "N3"),
    ("# ===== Wave 6: Common / Praise =====", None, None),
    ("俗に", "ぞくに", "N3"),
    ("俗称", "ぞくしょう", "N3"),
    ("賛歌", "さんか", "N3"),
    ("賛助", "さんじょ", "N3"),
    ("即物的", "そくぶつてき", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE6:
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
