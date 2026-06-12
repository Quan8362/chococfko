# -*- coding: utf-8 -*-
"""Appends Wave 39 — internal/contents/pathetic/riddle/price/age/vehicle/carefree."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE39 = [
    ("# ===== Wave 39: Internal / contents / pathetic =====", None, None),
    ("内情", "ないじょう", "N3"),
    ("中身", "なかみ", "N3"),
    ("情けない", "なさけない", "N3"),
    ("謎々", "なぞなぞ", "N3"),
    ("# ===== Wave 39: Course of events / somehow / shoulder =====", None, None),
    ("成り行き", "なりゆき", "N3"),
    ("何となく", "なんとなく", "N3"),
    ("担う", "になう", "N3"),
    ("にわか雨", "にわかあめ", "N3"),
    ("# ===== Wave 39: Price / age / carefree =====", None, None),
    ("値上がり", "ねあがり", "N3"),
    ("値上げ", "ねあげ", "N3"),
    ("値段", "ねだん", "N3"),
    ("値引き", "ねびき", "N3"),
    ("年齢", "ねんれい", "N3"),
    ("呑気", "のんき", "N3"),
    ("# ===== Wave 39: Vehicle / beverage / foster =====", None, None),
    ("乗り換える", "のりかえる", "N3"),
    ("乗り物", "のりもの", "N3"),
    ("飲み物", "のみもの", "N3"),
    ("育む", "はぐくむ", "N3"),
    ("果たして", "はたして", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE39:
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
