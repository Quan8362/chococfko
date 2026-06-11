# -*- coding: utf-8 -*-
"""Appends Wave 23 — reki/retsu/ren group: history, inferior, love, union."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE23 = [
    ("# ===== Wave 23: History / successive =====", None, None),
    ("歴史的", "れきしてき", "N3"),
    ("歴代", "れきだい", "N3"),
    ("歴任", "れきにん", "N3"),
    ("# ===== Wave 23: Listing / archipelago =====", None, None),
    ("列挙", "れっきょ", "N3"),
    ("列島", "れっとう", "N3"),
    ("# ===== Wave 23: Inferior / deteriorate =====", None, None),
    ("劣る", "おとる", "N3"),
    ("劣悪", "れつあく", "N3"),
    ("劣化", "れっか", "N3"),
    ("劣勢", "れっせい", "N3"),
    ("劣等感", "れっとうかん", "N3"),
    ("# ===== Wave 23: Split / love =====", None, None),
    ("裂ける", "さける", "N3"),
    ("恋しい", "こいしい", "N3"),
    ("恋愛", "れんあい", "N3"),
    ("# ===== Wave 23: Connection / union =====", None, None),
    ("連休", "れんきゅう", "N3"),
    ("連携", "れんけい", "N3"),
    ("連結", "れんけつ", "N3"),
    ("連合", "れんごう", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE23:
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
