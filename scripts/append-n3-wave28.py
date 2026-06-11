# -*- coding: utf-8 -*-
"""Appends Wave 28 — health/grave/treasure/farm/culture/formal."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE28 = [
    ("# ===== Wave 28: Places / body =====", None, None),
    ("保健所", "ほけんじょ", "N3"),
    ("墓地", "ぼち", "N3"),
    ("牧場", "ぼくじょう", "N3"),
    ("頬", "ほお", "N3"),
    ("# ===== Wave 28: Nouns / formal =====", None, None),
    ("宝物", "たからもの", "N3"),
    ("万全", "ばんぜん", "N3"),
    ("万能", "ばんのう", "N3"),
    ("未曾有", "みぞう", "N3"),
    ("末路", "まつろ", "N3"),
    ("# ===== Wave 28: Verbs =====", None, None),
    ("免れる", "まぬがれる", "N3"),
    ("# ===== Wave 28: Psychology / culture =====", None, None),
    ("妄想", "もうそう", "N3"),
    ("融通", "ゆうずう", "N3"),
    ("予言", "よげん", "N3"),
    ("浴衣", "ゆかた", "N3"),
    ("# ===== Wave 28: Events / seasons =====", None, None),
    ("来客", "らいきゃく", "N3"),
    ("流行", "りゅうこう", "N3"),
    ("翌朝", "よくあさ", "N3"),
    ("落ち葉", "おちば", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE28:
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
