# -*- coding: utf-8 -*-
"""Appends Wave 12 — da/tai groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE12 = [
    ("# ===== Wave 12: Compromise / Valid =====", None, None),
    ("妥協", "だきょう", "N3"),
    ("妥当", "だとう", "N3"),
    ("惰性", "だせい", "N3"),
    ("# ===== Wave 12: Strike / Break =====", None, None),
    ("打開", "だかい", "N3"),
    ("打撃", "だげき", "N3"),
    ("打倒", "だとう", "N3"),
    # ===== Wave 12: Body conditions =====
    ("体験", "たいけん", "N3"),
    ("体格", "たいかく", "N3"),
    ("体系", "たいけい", "N3"),
    ("体制", "たいせい", "N3"),
    ("体調", "たいちょう", "N3"),
    ("体面", "たいめん", "N3"),
    # ===== Wave 12: Confrontation / Contrast =====
    ("対決", "たいけつ", "N3"),
    ("対抗", "たいこう", "N3"),
    ("対処", "たいしょ", "N3"),
    ("対照", "たいしょう", "N3"),
    ("対象", "たいしょう", "N3"),
    ("対等", "たいとう", "N3"),
    ("対談", "たいだん", "N3"),
    ("対外", "たいがい", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for item in WAVE12:
    if len(item) == 3:
        word, reading, level = item
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
