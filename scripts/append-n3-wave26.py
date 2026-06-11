# -*- coding: utf-8 -*-
"""Appends Wave 26 — mixed useful N3: advice, depletion, emotion, midway, compatriots."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE26 = [
    ("# ===== Wave 26: Advice / depletion =====", None, None),
    ("助言", "じょげん", "N3"),
    ("消耗", "しょうもう", "N3"),
    ("上院", "じょういん", "N3"),
    ("情緒", "じょうちょ", "N3"),
    ("# ===== Wave 26: Future / recovery =====", None, None),
    ("先行き", "さきゆき", "N3"),
    ("全治", "ぜんち", "N3"),
    ("早急", "そうきゅう", "N3"),
    ("相反する", "あいはんする", "N3"),
    ("# ===== Wave 26: Substitute / finger =====", None, None),
    ("代替", "だいたい", "N3"),
    ("中指", "なかゆび", "N3"),
    ("# ===== Wave 26: Mourning / disciple =====", None, None),
    ("弔う", "とむらう", "N3"),
    ("直球", "ちょっきゅう", "N3"),
    ("弟子", "でし", "N3"),
    ("# ===== Wave 26: Midway / message / inside =====", None, None),
    ("途中", "とちゅう", "N3"),
    ("伝言", "でんごん", "N3"),
    ("同胞", "どうほう", "N3"),
    ("内幕", "うちまく", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE26:
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
