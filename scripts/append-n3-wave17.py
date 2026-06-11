# -*- coding: utf-8 -*-
"""Appends Wave 17 — danshi/chi/chi groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE17 = [
    ("# ===== Wave 17: Cardboard / Male =====", None, None),
    ("段ボール", "ダンボール", "N3"),
    ("男子", "だんし", "N3"),
    ("男爵", "だんしゃく", "N3"),
    ("男女", "だんじょ", "N3"),
    ("男女同権", "だんじょどうけん", "N3"),
    ("男装", "だんそう", "N3"),
    ("男優", "だんゆう", "N3"),
    ("# ===== Wave 17: Chat / Bargain =====", None, None),
    ("談笑", "だんしょう", "N3"),
    ("値切る", "ねぎる", "N3"),
    ("# ===== Wave 17: Knowledge / Intelligence =====", None, None),
    ("知覚", "ちかく", "N3"),
    ("知恵", "ちえ", "N3"),
    ("知見", "ちけん", "N3"),
    ("知性", "ちせい", "N3"),
    ("知的", "ちてき", "N3"),
    ("知能", "ちのう", "N3"),
    ("知名度", "ちめいど", "N3"),
    ("# ===== Wave 17: Position / Underground =====", None, None),
    ("地位", "ちい", "N3"),
    ("地下街", "ちかがい", "N3"),
    ("地価", "ちか", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE17:
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
