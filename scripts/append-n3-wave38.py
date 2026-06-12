# -*- coding: utf-8 -*-
"""Appends Wave 38 — clue/notebook/procedure/handmade/teriyaki/inquiry/alliance/thief."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE38 = [
    ("# ===== Wave 38: Clue / notebook / procedure =====", None, None),
    ("手がかり", "てがかり", "N3"),
    ("手帳", "てちょう", "N3"),
    ("手続き", "てつづき", "N3"),
    ("手作り", "てづくり", "N3"),
    ("照り焼き", "てりやき", "N3"),
    ("# ===== Wave 38: Encounter / inquiry / precious =====", None, None),
    ("出会う", "であう", "N3"),
    ("出かける", "でかける", "N3"),
    ("問い合わせ", "といあわせ", "N3"),
    ("尊い", "とうとい", "N3"),
    ("時折", "ときおり", "N3"),
    ("# ===== Wave 38: Here and there / handling / effort =====", None, None),
    ("所々", "ところどころ", "N3"),
    ("取り扱い", "とりあつかい", "N3"),
    ("取り組み", "とりくみ", "N3"),
    ("取り消し", "とりけし", "N3"),
    ("取引", "とりひき", "N3"),
    ("# ===== Wave 38: Especially / palpitation / alliance =====", None, None),
    ("取り分け", "とりわけ", "N3"),
    ("動悸", "どうき", "N3"),
    ("同盟", "どうめい", "N3"),
    ("# ===== Wave 38: Thief / greedy =====", None, None),
    ("泥棒", "どろぼう", "N3"),
    ("貪欲", "どんよく", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE38:
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
