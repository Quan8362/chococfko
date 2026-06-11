# -*- coding: utf-8 -*-
"""Appends Wave 13 — tai/dai groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE13 = [
    ("# ===== Wave 13: Confrontation / Contrast (missed w12) =====", None, None),
    ("対比", "たいひ", "N3"),
    ("対面", "たいめん", "N3"),
    ("# ===== Wave 13: Atmosphere / Large-scale =====", None, None),
    ("大気", "たいき", "N3"),
    ("大気汚染", "たいきおせん", "N3"),
    ("大規模", "だいきぼ", "N3"),
    ("大型", "おおがた", "N3"),
    ("大手", "おおて", "N3"),
    ("# ===== Wave 13: Public / Crowd / Earth =====", None, None),
    ("大衆", "たいしゅう", "N3"),
    ("大勢", "おおぜい", "N3"),
    ("大多数", "だいたすう", "N3"),
    ("大地", "だいち", "N3"),
    ("大地震", "おおじしん", "N3"),
    ("# ===== Wave 13: City / Ambassador / Carpenter =====", None, None),
    ("大都市", "だいとし", "N3"),
    ("大使", "たいし", "N3"),
    ("大使館", "たいしかん", "N3"),
    ("大工", "だいく", "N3"),
    ("# ===== Wave 13: Cleanup / New Year's Eve / Noise =====", None, None),
    ("大掃除", "おおそうじ", "N3"),
    ("大晦日", "おおみそか", "N3"),
    ("大騒ぎ", "おおさわぎ", "N3"),
    ("大声", "おおごえ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE13:
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
