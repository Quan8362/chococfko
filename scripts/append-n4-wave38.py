# -*- coding: utf-8 -*-
"""Appends Wave 38 to jlpt-n4-vocab.csv.
Focus: consideration/care compounds, sky/weather, color intensifiers, adjectives.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE38 = [
    ("# ===== Wave 38: Consideration / Care Compounds =====", None, None),
    ("思いやり", "おもいやり", "N4"),
    ("気遣い", "きづかい", "N4"),
    ("心遣い", "こころづかい", "N4"),
    ("心掛け", "こころがけ", "N4"),
    ("思いがけない", "おもいがけない", "N4"),
    ("# ===== Wave 38: Sky / Weather =====", None, None),
    ("快晴", "かいせい", "N4"),
    ("曇り空", "くもりぞら", "N4"),
    ("夜空", "よぞら", "N4"),
    ("夕空", "ゆうぞら", "N4"),
    ("空模様", "そらもよう", "N4"),
    ("# ===== Wave 38: Color Intensifiers =====", None, None),
    ("真っ白", "まっしろ", "N4"),
    ("真っ黒", "まっくろ", "N4"),
    ("真っ赤", "まっか", "N4"),
    ("真っ青", "まっさお", "N4"),
    ("真っ暗", "まっくら", "N4"),
    ("# ===== Wave 38: I-adjectives =====", None, None),
    ("鋭い", "するどい", "N4"),
    ("鈍い", "にぶい", "N4"),
    ("固い", "かたい", "N4"),
    ("柔らかい", "やわらかい", "N4"),
    ("浅い", "あさい", "N4"),
    ("細い", "ほそい", "N4"),
    ("太い", "ふとい", "N4"),
    ("眩しい", "まぶしい", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE38:
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
