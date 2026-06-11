# -*- coding: utf-8 -*-
"""Appends Wave 29 — compatibility/keys/warmth/autumn/knitting."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE29 = [
    ("# ===== Wave 29: Culture / nature =====", None, None),
    ("和太鼓", "わだいこ", "N3"),
    ("歪む", "ゆがむ", "N3"),
    ("秋晴れ", "あきばれ", "N3"),
    ("雨上がり", "あめあがり", "N3"),
    ("# ===== Wave 29: Keys / passwords =====", None, None),
    ("合鍵", "あいかぎ", "N3"),
    ("合言葉", "あいことば", "N3"),
    ("相性", "あいしょう", "N3"),
    ("挙句", "あげく", "N3"),
    ("# ===== Wave 29: Warmth / home =====", None, None),
    ("温まる", "あたたまる", "N3"),
    ("温める", "あたためる", "N3"),
    ("足元", "あしもと", "N3"),
    ("編み物", "あみもの", "N3"),
    ("# ===== Wave 29: Formal / names =====", None, None),
    ("あだ名", "あだな", "N3"),
    ("宛先", "あてさき", "N3"),
    ("宛名", "あてな", "N3"),
    ("当てはめる", "あてはめる", "N3"),
    ("# ===== Wave 29: Character / manner =====", None, None),
    ("荒々しい", "あらあらしい", "N3"),
    ("あり方", "ありかた", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE29:
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
