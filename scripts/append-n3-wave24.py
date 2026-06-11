# -*- coding: utf-8 -*-
"""Appends Wave 24 — ren/ro group: solidarity, federation, route, corridor, old age."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE24 = [
    ("# ===== Wave 24: Solidarity / federation =====", None, None),
    ("連帯", "れんたい", "N3"),
    ("連日", "れんじつ", "N3"),
    ("連邦", "れんぽう", "N3"),
    ("連盟", "れんめい", "N3"),
    ("連絡先", "れんらくさき", "N3"),
    ("連立", "れんりつ", "N3"),
    ("# ===== Wave 24: Route / exposure / bath =====", None, None),
    ("路線", "ろせん", "N3"),
    ("露出", "ろしゅつ", "N3"),
    ("露天風呂", "ろてんぶろ", "N3"),
    ("# ===== Wave 24: Labour / corridor =====", None, None),
    ("労う", "ねぎらう", "N3"),
    ("廊下", "ろうか", "N3"),
    ("# ===== Wave 24: Reading aloud / cheerful =====", None, None),
    ("朗らか", "ほがらか", "N3"),
    ("朗読", "ろうどく", "N3"),
    ("# ===== Wave 24: Ronin / waste / old age =====", None, None),
    ("浪人", "ろうにん", "N3"),
    ("浪費", "ろうひ", "N3"),
    ("老後", "ろうご", "N3"),
    ("老衰", "ろうすい", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE24:
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
