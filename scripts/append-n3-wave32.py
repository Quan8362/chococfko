# -*- coding: utf-8 -*-
"""Appends Wave 32 — seasons/hypothesis/love/perfection/miracle."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE32 = [
    ("# ===== Wave 32: Seasons / harshness =====", None, None),
    ("夏季", "かき", "N3"),
    ("過酷", "かこく", "N3"),
    ("箇所", "かしょ", "N3"),
    ("仮説", "かせつ", "N3"),
    ("# ===== Wave 32: Love / position =====", None, None),
    ("片思い", "かたおもい", "N3"),
    ("肩書き", "かたがき", "N3"),
    ("偏る", "かたよる", "N3"),
    ("# ===== Wave 32: Revolution / operation =====", None, None),
    ("画期的", "かっきてき", "N3"),
    ("稼働", "かどう", "N3"),
    ("科目", "かもく", "N3"),
    ("可哀想", "かわいそう", "N3"),
    ("# ===== Wave 32: Audit / essence / perfect =====", None, None),
    ("監査", "かんさ", "N3"),
    ("肝心", "かんじん", "N3"),
    ("完璧", "かんぺき", "N3"),
    ("# ===== Wave 32: Origin / signs / miracles =====", None, None),
    ("起源", "きげん", "N3"),
    ("兆し", "きざし", "N3"),
    ("傷つく", "きずつく", "N3"),
    ("奇跡", "きせき", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE32:
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
