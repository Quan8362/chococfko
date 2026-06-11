# -*- coding: utf-8 -*-
"""Appends Wave 36 — gradually/dwelling/control/forefront/vacuum/frank/abacus."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE36 = [
    ("# ===== Wave 36: Gradual / dwelling / impudent =====", None, None),
    ("徐々に", "じょじょに", "N3"),
    ("全て", "すべて", "N3"),
    ("住まい", "すまい", "N3"),
    ("図々しい", "ずうずうしい", "N3"),
    ("# ===== Wave 36: Control / forefront / exclusive =====", None, None),
    ("制御", "せいぎょ", "N3"),
    ("先頭", "せんとう", "N3"),
    ("専用", "せんよう", "N3"),
    ("税込み", "ぜいこみ", "N3"),
    ("# ===== Wave 36: Mutual / vacuum / noisy =====", None, None),
    ("相互", "そうご", "N3"),
    ("掃除機", "そうじき", "N3"),
    ("騒々しい", "そうぞうしい", "N3"),
    ("聡明", "そうめい", "N3"),
    ("# ===== Wave 36: Blunt / frank / fainting =====", None, None),
    ("素っ気ない", "そっけない", "N3"),
    ("率直", "そっちょく", "N3"),
    ("卒倒", "そっとう", "N3"),
    ("# ===== Wave 36: Equipped / abacus / successively =====", None, None),
    ("備わる", "そなわる", "N3"),
    ("算盤", "そろばん", "N3"),
    ("続々", "ぞくぞく", "N3"),
    ("体当たり", "たいあたり", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE36:
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
