# -*- coding: utf-8 -*-
"""Appends Wave 16 — datsu/dan/dan groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE16 = [
    ("# ===== Wave 16: Escape / Withdrawal =====", None, None),
    ("脱出", "だっしゅつ", "N3"),
    ("脱税", "だつぜい", "N3"),
    ("脱線", "だっせん", "N3"),
    ("脱退", "だったい", "N3"),
    ("脱帽", "だつぼう", "N3"),
    ("脱毛", "だつもう", "N3"),
    ("# ===== Wave 16: Reach / Postpone =====", None, None),
    ("たどり着く", "たどりつく", "N3"),
    ("棚上げ", "たなあげ", "N3"),
    ("# ===== Wave 16: Firm / Decisive / Give up =====", None, None),
    ("断固", "だんこ", "N3"),
    ("断行", "だんこう", "N3"),
    ("断食", "だんじき", "N3"),
    ("断水", "だんすい", "N3"),
    ("断層", "だんそう", "N3"),
    ("断定", "だんてい", "N3"),
    ("断念", "だんねん", "N3"),
    ("断片", "だんぺん", "N3"),
    ("断面", "だんめん", "N3"),
    ("# ===== Wave 16: Heating / Warmth =====", None, None),
    ("暖房", "だんぼう", "N3"),
    ("暖炉", "だんろ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE16:
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
