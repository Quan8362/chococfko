# -*- coding: utf-8 -*-
"""Appends Wave 29 to jlpt-n4-vocab.csv.
Focus: school, nature/terrain, city, time, traditional clothing.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE29 = [
    ("# ===== Wave 29: School / Education =====", None, None),
    ("成績", "せいせき", "N4"),
    ("放課後", "ほうかご", "N4"),
    ("校庭", "こうてい", "N4"),
    ("入学", "にゅうがく", "N4"),
    ("休み時間", "やすみじかん", "N4"),
    ("# ===== Wave 29: Nature / Terrain =====", None, None),
    ("森林", "しんりん", "N4"),
    ("草原", "そうげん", "N4"),
    ("高原", "こうげん", "N4"),
    ("丘", "おか", "N4"),
    ("崖", "がけ", "N4"),
    ("洞窟", "どうくつ", "N4"),
    ("泉", "いずみ", "N4"),
    ("湿地", "しっち", "N4"),
    ("# ===== Wave 29: City / Urban =====", None, None),
    ("商店街", "しょうてんがい", "N4"),
    ("路地", "ろじ", "N4"),
    ("横断歩道", "おうだんほどう", "N4"),
    ("街角", "まちかど", "N4"),
    ("# ===== Wave 29: Time Expressions =====", None, None),
    ("真夜中", "まよなか", "N4"),
    ("早朝", "そうちょう", "N4"),
    ("夜半", "やはん", "N4"),
    ("# ===== Wave 29: Traditional Clothing =====", None, None),
    ("浴衣", "ゆかた", "N4"),
    ("帯", "おび", "N4"),
    ("下駄", "げた", "N4"),
    ("草履", "ぞうり", "N4"),
    ("足袋", "たび", "N4"),
    ("袴", "はかま", "N4"),
    ("和装", "わそう", "N4"),
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
