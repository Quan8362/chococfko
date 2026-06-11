# -*- coding: utf-8 -*-
"""Appends Wave 9b — geki/ketsu/ken/gen groups extending wave 9."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE9B = [
    ("# ===== Wave 9b: Fierce / Battle =====", None, None),
    ("激動", "げきどう", "N3"),
    ("激流", "げきりゅう", "N3"),
    ("激戦", "げきせん", "N3"),
    ("# ===== Wave 9b: Absence / Absence =====", None, None),
    ("欠勤", "けっきん", "N3"),
    ("欠航", "けっこう", "N3"),
    ("# ===== Wave 9b: Resolution / Breakdown =====", None, None),
    ("決議", "けつぎ", "N3"),
    ("決裂", "けつれつ", "N3"),
    ("決行", "けっこう", "N3"),
    ("決済", "けっさい", "N3"),
    ("# ===== Wave 9b: Blood / Lineage =====", None, None),
    ("血縁", "けつえん", "N3"),
    ("血統", "けっとう", "N3"),
    ("# ===== Wave 9b: Modesty / Disillusionment =====", None, None),
    ("謙遜", "けんそん", "N3"),
    ("幻滅", "げんめつ", "N3"),
    ("# ===== Wave 9b: Authority / Power =====", None, None),
    ("権威", "けんい", "N3"),
    ("権限", "けんげん", "N3"),
    ("権力", "けんりょく", "N3"),
    ("# ===== Wave 9b: Present Condition =====", None, None),
    ("現役", "げんえき", "N3"),
    ("現状", "げんじょう", "N3"),
    ("# ===== Wave 9b: Formation / Observation =====", None, None),
    ("結成", "けっせい", "N3"),
    ("見捨てる", "みすてる", "N3"),
    ("見習う", "みならう", "N3"),
    ("見積もる", "みつもる", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE9B:
    if word.startswith("#"):
        lines_to_add.append(f"{word},,\n")
    elif word not in existing:
        lines_to_add.append(f"{word},{reading},{level}\n")
        added += 1
    else:
        skipped += 1

with open(CSV_FILE, "a", encoding="utf-8", newline="") as f:
    f.writelines(lines_to_add)

print(f"Added {added} new entries, skipped {skipped} duplicates")
