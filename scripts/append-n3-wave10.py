# -*- coding: utf-8 -*-
"""Appends Wave 10 — gen/gen/kotowaza/kengaku/miru groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE10 = [
    ("# ===== Wave 10: Intensification / Arts =====", None, None),
    ("激化", "げきか", "N3"),
    ("芸名", "げいめい", "N3"),
    ("芸能界", "げいのうかい", "N3"),
    ("# ===== Wave 10: Observation verbs =====", None, None),
    ("見識", "けんしき", "N3"),
    ("見地", "けんち", "N3"),
    ("見張る", "みはる", "N3"),
    ("見直し", "みなおし", "N3"),
    ("見抜く", "みぬく", "N3"),
    ("見分ける", "みわける", "N3"),
    ("# ===== Wave 10: Devotion / Reduction =====", None, None),
    ("献身", "けんしん", "N3"),
    ("減少", "げんしょう", "N3"),
    ("減速", "げんそく", "N3"),
    ("# ===== Wave 10: Language / Proverb / Limit =====", None, None),
    ("言語", "げんご", "N3"),
    ("言動", "げんどう", "N3"),
    ("言論", "げんろん", "N3"),
    ("諺", "ことわざ", "N3"),
    ("限定", "げんてい", "N3"),
    ("限度", "げんど", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE10:
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
