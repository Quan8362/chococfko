# -*- coding: utf-8 -*-
"""Appends Wave 8 — household/already/machine/period vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE8 = [
    ("# ===== Wave 8: Household Duties =====", None, None),
    ("家事", "かじ", "N3"),
    ("家出", "いえで", "N3"),
    ("家主", "やぬし", "N3"),
    ("家政婦", "かせいふ", "N3"),
    ("家臣", "かしん", "N3"),
    ("# ===== Wave 8: Quantity / Extent =====", None, None),
    ("幾分", "いくぶん", "N3"),
    ("幾多", "いくた", "N3"),
    ("# ===== Wave 8: Already / Existing =====", None, None),
    ("既に", "すでに", "N3"),
    ("既婚", "きこん", "N3"),
    ("既製", "きせい", "N3"),
    ("既存", "きそん", "N3"),
    ("既定", "きてい", "N3"),
    ("既視感", "きしかん", "N3"),
    ("# ===== Wave 8: Deadline / Term =====", None, None),
    ("期日", "きじつ", "N3"),
    ("期末", "きまつ", "N3"),
    ("# ===== Wave 8: Abstention =====", None, None),
    ("棄権", "きけん", "N3"),
    ("# ===== Wave 8: Machine / System / Mood =====", None, None),
    ("機嫌", "きげん", "N3"),
    ("機構", "きこう", "N3"),
    ("機関", "きかん", "N3"),
    ("机上", "きじょう", "N3"),
    ("旗揚げ", "はたあげ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE8:
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
