# -*- coding: utf-8 -*-
"""Appends Wave 41 — echo/metaphor/sunburn/spread/surprise/dubbing/crossing/editing/bandage."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE41 = [
    ("# ===== Wave 41: Echo / metaphor / sunburn =====", None, None),
    ("響き", "ひびき", "N3"),
    ("比喩", "ひゆ", "N3"),
    ("日焼け", "ひやけ", "N3"),
    ("広がる", "ひろがる", "N3"),
    ("# ===== Wave 41: Surprise / increase / dubbing =====", None, None),
    ("不意打ち", "ふいうち", "N3"),
    ("増える", "ふえる", "N3"),
    ("吹き替え", "ふきかえ", "N3"),
    ("# ===== Wave 41: Everyday clothes / hangover / universal =====", None, None),
    ("普段着", "ふだんぎ", "N3"),
    ("二日酔い", "ふつかよい", "N3"),
    ("普遍", "ふへん", "N3"),
    ("踏切", "ふみきり", "N3"),
    ("# ===== Wave 41: Augment / unnecessary / transfer =====", None, None),
    ("増やす", "ふやす", "N3"),
    ("不要", "ふよう", "N3"),
    ("振込", "ふりこみ", "N3"),
    ("# ===== Wave 41: Hometown / supplement / department =====", None, None),
    ("故郷", "ふるさと", "N3"),
    ("付録", "ふろく", "N3"),
    ("部署", "ぶしょ", "N3"),
    ("# ===== Wave 41: Editing / bandage / spinach =====", None, None),
    ("編集", "へんしゅう", "N3"),
    ("包帯", "ほうたい", "N3"),
    ("ほうれん草", "ほうれんそう", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE41:
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
