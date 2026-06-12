# -*- coding: utf-8 -*-
"""Appends Wave 40 — discussion/reflection/rebellion/repetition/revelation/moving/trigger/monopolize."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE40 = [
    ("# ===== Wave 40: Discussion / reflection / rebellion =====", None, None),
    ("話し合い", "はなしあい", "N3"),
    ("反映", "はんえい", "N3"),
    ("反逆", "はんぎゃく", "N3"),
    ("反復", "はんぷく", "N3"),
    ("# ===== Wave 40: Disclosure / excerpt / waiting room =====", None, None),
    ("暴露", "ばくろ", "N3"),
    ("抜粋", "ばっすい", "N3"),
    ("控え室", "ひかえしつ", "N3"),
    ("# ===== Wave 40: Trigger / subtraction / drawer =====", None, None),
    ("引き金", "ひきがね", "N3"),
    ("引き算", "ひきざん", "N3"),
    ("引き出し", "ひきだし", "N3"),
    ("引き継ぎ", "ひきつぎ", "N3"),
    ("引き続き", "ひきつづき", "N3"),
    ("# ===== Wave 40: Long time / moving / desperate =====", None, None),
    ("久々", "ひさびさ", "N3"),
    ("引っ越し", "ひっこし", "N3"),
    ("必死", "ひっし", "N3"),
    ("# ===== Wave 40: For now / monopolize / solitude =====", None, None),
    ("一先ず", "ひとまず", "N3"),
    ("独り占め", "ひとりじめ", "N3"),
    ("一人ぼっち", "ひとりぼっち", "N3"),
    ("日々", "ひび", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE40:
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
