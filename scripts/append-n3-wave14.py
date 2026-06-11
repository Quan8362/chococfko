# -*- coding: utf-8 -*-
"""Appends Wave 14 — 大/第/題 continuation."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE14 = [
    ("# ===== Wave 14: President / Bean / Quantity =====", None, None),
    ("大統領", "だいとうりょう", "N3"),
    ("大豆", "だいず", "N3"),
    ("大部分", "だいぶぶん", "N3"),
    ("大量", "たいりょう", "N3"),
    ("大量生産", "たいりょうせいさん", "N3"),
    ("# ===== Wave 14: Scale / Style / Material =====", None, None),
    ("大幅", "おおはば", "N3"),
    ("大柄", "おおがら", "N3"),
    ("大文字", "おおもじ", "N3"),
    ("大理石", "だいりせき", "N3"),
    ("大麦", "おおむぎ", "N3"),
    ("# ===== Wave 14: History / Culture =====", None, None),
    ("大仏", "だいぶつ", "N3"),
    ("大砲", "たいほう", "N3"),
    ("大名", "だいみょう", "N3"),
    ("醍醐味", "だいごみ", "N3"),
    ("# ===== Wave 14: Title / Third party / Adverb =====", None, None),
    ("題材", "だいざい", "N3"),
    ("題名", "だいめい", "N3"),
    ("第三者", "だいさんしゃ", "N3"),
    ("大分", "だいぶ", "N3"),
    ("第一印象", "だいいちいんしょう", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE14:
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
