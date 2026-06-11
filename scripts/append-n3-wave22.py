# -*- coding: utf-8 -*-
"""Appends Wave 22 — rui/rei group: accumulation, analogy, cold, encourage, etiquette."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE22 = [
    ("# ===== Wave 22: Accumulation / analogy =====", None, None),
    ("累積", "るいせき", "N3"),
    ("類似", "るいじ", "N3"),
    ("類推", "るいすい", "N3"),
    ("# ===== Wave 22: Exception / normal year =====", None, None),
    ("例外", "れいがい", "N3"),
    ("例年", "れいねん", "N3"),
    ("# ===== Wave 22: Cold / temperature =====", None, None),
    ("冷える", "ひえる", "N3"),
    ("冷笑", "れいしょう", "N3"),
    ("冷却", "れいきゃく", "N3"),
    ("冷酷", "れいこく", "N3"),
    ("冷静", "れいせい", "N3"),
    ("冷戦", "れいせん", "N3"),
    ("冷淡", "れいたん", "N3"),
    ("冷凍", "れいとう", "N3"),
    ("冷房", "れいぼう", "N3"),
    ("# ===== Wave 22: Encouragement / etiquette =====", None, None),
    ("励ます", "はげます", "N3"),
    ("励む", "はげむ", "N3"),
    ("礼儀", "れいぎ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE22:
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
