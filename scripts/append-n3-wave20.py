# -*- coding: utf-8 -*-
"""Appends Wave 20 — chuu-naka/naka-dachi groups."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE20 = [
    ("# ===== Wave 20: Middle / Height =====", None, None),
    ("中盤", "ちゅうばん", "N3"),
    ("中部", "ちゅうぶ", "N3"),
    ("中背", "ちゅうぜい", "N3"),
    ("# ===== Wave 20: Middle Way / Neutrality =====", None, None),
    ("中米", "ちゅうべい", "N3"),
    ("中庸", "ちゅうよう", "N3"),
    ("中立", "ちゅうりつ", "N3"),
    ("中略", "ちゅうりゃく", "N3"),
    ("中流", "ちゅうりゅう", "N3"),
    ("中和", "ちゅうわ", "N3"),
    ("# ===== Wave 20: Mediation / Relationships =====", None, None),
    ("仲違い", "なかたがい", "N3"),
    ("仲介", "ちゅうかい", "N3"),
    ("仲間はずれ", "なかまはずれ", "N3"),
    ("仲間入り", "なかまいり", "N3"),
    ("仲人", "なこうど", "N3"),
    ("仲立ち", "なかだち", "N3"),
    ("# ===== Wave 20: Loyalty / Acrobatics =====", None, None),
    ("忠告", "ちゅうこく", "N3"),
    ("宙返り", "ちゅうがえり", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE20:
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
