# -*- coding: utf-8 -*-
"""Appends Wave 34 — luck/intersection/desert/customs/blunder."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE34 = [
    ("# ===== Wave 34: Luck / traffic / rotation =====", None, None),
    ("幸運", "こううん", "N3"),
    ("交差点", "こうさてん", "N3"),
    ("交代", "こうたい", "N3"),
    ("広報", "こうほう", "N3"),
    ("枯渇", "こかつ", "N3"),
    ("# ===== Wave 34: Nature / personality =====", None, None),
    ("木漏れ日", "こもれび", "N3"),
    ("強情", "ごうじょう", "N3"),
    ("逆さま", "さかさま", "N3"),
    ("先駆け", "さきがけ", "N3"),
    ("砂漠", "さばく", "N3"),
    ("# ===== Wave 34: Communication / mail =====", None, None),
    ("差出人", "さしだしにん", "N3"),
    ("差し支え", "さしつかえ", "N3"),
    ("# ===== Wave 34: Finish / happiness / method =====", None, None),
    ("仕上げ", "しあげ", "N3"),
    ("幸せ", "しあわせ", "N3"),
    ("仕方", "しかた", "N3"),
    ("仕来り", "しきたり", "N3"),
    ("# ===== Wave 34: Stimulation / failure =====", None, None),
    ("刺激的", "しげきてき", "N3"),
    ("失神", "しっしん", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE34:
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
