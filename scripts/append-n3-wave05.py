# -*- coding: utf-8 -*-
"""Appends Wave 5 to jlpt-n3-vocab.csv — castle/joke/immediate/habit vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE5 = [
    ("# ===== Wave 5: Joke / Verbose =====", None, None),
    ("冗談", "じょうだん", "N3"),
    ("冗長", "じょうちょう", "N3"),
    ("# ===== Wave 5: Castle =====", None, None),
    ("城", "しろ", "N3"),
    ("城下町", "じょうかまち", "N3"),
    ("城壁", "じょうへき", "N3"),
    ("# ===== Wave 5: Place / Occasion =====", None, None),
    ("場違い", "ばちがい", "N3"),
    ("場内", "じょうない", "N3"),
    ("# ===== Wave 5: Habit / Permanent =====", None, None),
    ("常時", "じょうじ", "N3"),
    ("常習", "じょうしゅう", "N3"),
    ("常設", "じょうせつ", "N3"),
    ("常任", "じょうにん", "N3"),
    ("常務", "じょうむ", "N3"),
    ("常用", "じょうよう", "N3"),
    ("# ===== Wave 5: Boarding / Vehicle =====", None, None),
    ("乗馬", "じょうば", "N3"),
    ("乗船", "じょうせん", "N3"),
    ("乗車", "じょうしゃ", "N3"),
    ("乗車券", "じょうしゃけん", "N3"),
    ("乗組員", "のりくみいん", "N3"),
    ("乗務員", "じょうむいん", "N3"),
    ("乗用車", "じょうようしゃ", "N3"),
    ("# ===== Wave 5: Immediate / Conform =====", None, None),
    ("側面", "そくめん", "N3"),
    ("即ち", "すなわち", "N3"),
    ("即興", "そっきょう", "N3"),
    ("即刻", "そっこく", "N3"),
    ("即座", "そくざ", "N3"),
    ("即死", "そくし", "N3"),
    ("即席", "そくせき", "N3"),
    ("即断", "そくだん", "N3"),
    ("即答", "そくとう", "N3"),
    ("即日", "そくじつ", "N3"),
    ("則る", "のっとる", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE5:
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
