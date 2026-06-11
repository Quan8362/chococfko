# -*- coding: utf-8 -*-
"""Appends Wave 11 — sou/zou/niku/zou/ta groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE11 = [
    ("# ===== Wave 11: Noise / Uproar =====", None, None),
    ("騒ぎ", "さわぎ", "N3"),
    ("騒音", "そうおん", "N3"),
    ("# ===== Wave 11: Increase =====", None, None),
    ("増加", "ぞうか", "N3"),
    ("増税", "ぞうぜい", "N3"),
    ("増大", "ぞうだい", "N3"),
    ("増強", "ぞうきょう", "N3"),
    ("# ===== Wave 11: Hatred / Organs / Gift =====", None, None),
    ("憎しみ", "にくしみ", "N3"),
    ("憎悪", "ぞうお", "N3"),
    ("臓器", "ぞうき", "N3"),
    ("贈呈", "ぞうてい", "N3"),
    ("# ===== Wave 11: Promotion / Confidant =====", None, None),
    ("促進", "そくしん", "N3"),
    ("側近", "そっきん", "N3"),
    ("# ===== Wave 11: Diverse / Busy / Drum =====", None, None),
    ("多様", "たよう", "N3"),
    ("多様性", "たようせい", "N3"),
    ("多忙", "たぼう", "N3"),
    ("太鼓", "たいこ", "N3"),
    ("# ===== Wave 11: Depravity / Ships / Language =====", None, None),
    ("堕落", "だらく", "N3"),
    ("造船", "ぞうせん", "N3"),
    ("俗語", "ぞくご", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE11:
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
