# -*- coding: utf-8 -*-
"""Appends Wave 18 — chi/ji geography + chijoku groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE18 = [
    ("# ===== Wave 18: Earth / Geography =====", None, None),
    ("地殻", "ちかく", "N3"),
    ("地すべり", "じすべり", "N3"),
    ("地球", "ちきゅう", "N3"),
    ("地球規模", "ちきゅうきぼ", "N3"),
    ("地区", "ちく", "N3"),
    ("地元", "じもと", "N3"),
    ("地質", "ちしつ", "N3"),
    ("地主", "じぬし", "N3"),
    ("地上", "ちじょう", "N3"),
    ("地震", "じしん", "N3"),
    ("地図", "ちず", "N3"),
    ("# ===== Wave 18: Zone / Spot / Steady =====", None, None),
    ("地帯", "ちたい", "N3"),
    ("地点", "ちてん", "N3"),
    ("地道", "じみち", "N3"),
    ("地名", "ちめい", "N3"),
    ("地面", "じめん", "N3"),
    ("地理", "ちり", "N3"),
    ("# ===== Wave 18: Shame / Middle Ages =====", None, None),
    ("恥", "はじ", "N3"),
    ("恥辱", "ちじょく", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE18:
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
