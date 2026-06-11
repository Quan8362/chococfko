# -*- coding: utf-8 -*-
"""Appends Wave 9 — zan/zanki/shi verb groups for N3."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE9 = [
    ("# ===== Wave 9: Novel / Provisional / Cruel =====", None, None),
    ("斬新", "ざんしん", "N3"),
    ("暫定", "ざんてい", "N3"),
    ("残骸", "ざんがい", "N3"),
    ("残酷", "ざんこく", "N3"),
    ("残暑", "ざんしょ", "N3"),
    ("残像", "ざんぞう", "N3"),
    ("残虐", "ざんぎゃく", "N3"),
    ("残留", "ざんりゅう", "N3"),
    ("# ===== Wave 9: Shi compound verbs / actions =====", None, None),
    ("仕業", "しわざ", "N3"),
    ("仕掛ける", "しかける", "N3"),
    ("仕草", "しぐさ", "N3"),
    ("仕送り", "しおくり", "N3"),
    ("仕返し", "しかえし", "N3"),
    ("仕切る", "しきる", "N3"),
    ("# ===== Wave 9: Mission / Rank / Shore =====", None, None),
    ("使命", "しめい", "N3"),
    ("上等", "じょうとう", "N3"),
    ("上陸", "じょうりく", "N3"),
    ("上流", "じょうりゅう", "N3"),
    ("# ===== Wave 9: Boarding / Flag =====", None, None),
    ("乗り込む", "のりこむ", "N3"),
    ("旗", "はた", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE9:
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
