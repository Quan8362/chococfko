# -*- coding: utf-8 -*-
"""Appends Wave 21 — ryou/rin group: travel, coexistence, therapy, ethics."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE21 = [
    ("# ===== Wave 21: Travel vocabulary =====", None, None),
    ("旅先", "たびさき", "N3"),
    ("旅程", "りょてい", "N3"),
    ("旅費", "りょひ", "N3"),
    ("旅立ち", "たびだち", "N3"),
    ("# ===== Wave 21: Common expressions =====", None, None),
    ("了解", "りょうかい", "N3"),
    ("両替", "りょうがえ", "N3"),
    ("両立", "りょうりつ", "N3"),
    ("# ===== Wave 21: Medical / recuperation =====", None, None),
    ("療法", "りょうほう", "N3"),
    ("療養", "りょうよう", "N3"),
    ("# ===== Wave 21: Quality / conscience =====", None, None),
    ("良識", "りょうしき", "N3"),
    ("良質", "りょうしつ", "N3"),
    ("良心", "りょうしん", "N3"),
    ("# ===== Wave 21: Production / territory =====", None, None),
    ("量産", "りょうさん", "N3"),
    ("領収書", "りょうしゅうしょ", "N3"),
    ("領土", "りょうど", "N3"),
    ("# ===== Wave 21: Ethics / provisional =====", None, None),
    ("倫理", "りんり", "N3"),
    ("臨時", "りんじ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE21:
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
