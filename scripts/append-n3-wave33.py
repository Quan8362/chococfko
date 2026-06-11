# -*- coding: utf-8 -*-
"""Appends Wave 33 — cooperation/weapon/disguise/settlement/elements."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE33 = [
    ("# ===== Wave 33: Donation / weapons / cooperation =====", None, None),
    ("寄付", "きふ", "N3"),
    ("凶悪", "きょうあく", "N3"),
    ("凶器", "きょうき", "N3"),
    ("強固", "きょうこ", "N3"),
    ("協力", "きょうりょく", "N3"),
    ("# ===== Wave 33: Switches / trump cards =====", None, None),
    ("切り替え", "きりかえ", "N3"),
    ("切り札", "きりふだ", "N3"),
    ("極める", "きわめる", "N3"),
    ("# ===== Wave 33: Pseudo / disguise =====", None, None),
    ("疑似", "ぎじ", "N3"),
    ("偽装", "ぎそう", "N3"),
    ("# ===== Wave 33: Blocks / assembly / crowds =====", None, None),
    ("区画", "くかく", "N3"),
    ("屈服", "くっぷく", "N3"),
    ("群衆", "ぐんしゅう", "N3"),
    ("組み合わせ", "くみあわせ", "N3"),
    ("組み立て", "くみたて", "N3"),
    ("# ===== Wave 33: Settlement / reliability / science =====", None, None),
    ("決着", "けっちゃく", "N3"),
    ("堅実", "けんじつ", "N3"),
    ("元素", "げんそ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE33:
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
