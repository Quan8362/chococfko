# -*- coding: utf-8 -*-
"""Appends Wave 37 — typhoon/tornado/tabako/sigh/exploration/savings/disposable."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE37 = [
    ("# ===== Wave 37: Typhoon / tornado / kind =====", None, None),
    ("台風", "たいふう", "N3"),
    ("類い", "たぐい", "N3"),
    ("竜巻", "たつまき", "N3"),
    ("# ===== Wave 37: Tatemae / metaphor / cigarette =====", None, None),
    ("建前", "たてまえ", "N3"),
    ("例え", "たとえ", "N3"),
    ("煙草", "タバコ", "N3"),
    ("度々", "たびたび", "N3"),
    ("# ===== Wave 37: Sigh / rely / exploration =====", None, None),
    ("ため息", "ためいき", "N3"),
    ("頼る", "たよる", "N3"),
    ("探検", "たんけん", "N3"),
    ("# ===== Wave 37: Shortcut / steadily / rice bowl =====", None, None),
    ("近道", "ちかみち", "N3"),
    ("着々", "ちゃくちゃく", "N3"),
    ("茶碗", "ちゃわん", "N3"),
    ("中核", "ちゅうかく", "N3"),
    ("# ===== Wave 37: Sign / savings / diameter =====", None, None),
    ("兆候", "ちょうこう", "N3"),
    ("貯蓄", "ちょちく", "N3"),
    ("直感的", "ちょっかんてき", "N3"),
    ("直径", "ちょっけい", "N3"),
    ("# ===== Wave 37: Disposable / discreet =====", None, None),
    ("使い捨て", "つかいすて", "N3"),
    ("慎む", "つつしむ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE37:
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
