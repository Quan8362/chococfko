# -*- coding: utf-8 -*-
"""Appends Wave 25 — roku/ron/wa group: recording, logic, reconciliation, topic."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE25 = [
    ("# ===== Wave 25: Recording =====", None, None),
    ("録音", "ろくおん", "N3"),
    ("録画", "ろくが", "N3"),
    ("# ===== Wave 25: Logic / debate =====", None, None),
    ("論外", "ろんがい", "N3"),
    ("論争", "ろんそう", "N3"),
    ("論点", "ろんてん", "N3"),
    ("論理", "ろんり", "N3"),
    ("論理的", "ろんりてき", "N3"),
    ("# ===== Wave 25: Reconciliation / Japanese things =====", None, None),
    ("和解", "わかい", "N3"),
    ("和室", "わしつ", "N3"),
    ("和食", "わしょく", "N3"),
    ("和平", "わへい", "N3"),
    ("# ===== Wave 25: Topic / bribe / skill =====", None, None),
    ("話し合う", "はなしあう", "N3"),
    ("話題", "わだい", "N3"),
    ("賄賂", "わいろ", "N3"),
    ("腕前", "うでまえ", "N3"),
    ("腕時計", "うでどけい", "N3"),
    ("# ===== Wave 25: Bay / coast =====", None, None),
    ("湾岸", "わんがん", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE25:
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
