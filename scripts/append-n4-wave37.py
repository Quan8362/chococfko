# -*- coding: utf-8 -*-
"""Appends Wave 37 to jlpt-n4-vocab.csv.
Focus: na-adjectives, compound nouns (paths/directions), nature compounds, emotional verbs.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE37 = [
    ("# ===== Wave 37: Na-adjectives =====", None, None),
    ("素直", "すなお", "N4"),
    ("謙虚", "けんきょ", "N4"),
    ("真剣", "しんけん", "N4"),
    ("素朴", "そぼく", "N4"),
    ("地味", "じみ", "N4"),
    ("派手", "はで", "N4"),
    ("穏やか", "おだやか", "N4"),
    ("和やか", "なごやか", "N4"),
    ("# ===== Wave 37: Paths / Directions =====", None, None),
    ("行き先", "ゆきさき", "N4"),
    ("帰り道", "かえりみち", "N4"),
    ("近道", "ちかみち", "N4"),
    ("抜け道", "ぬけみち", "N4"),
    ("見晴らし", "みはらし", "N4"),
    ("日当たり", "ひあたり", "N4"),
    ("# ===== Wave 37: Nature Compound Words =====", None, None),
    ("木の葉", "このは", "N4"),
    ("草木", "くさき", "N4"),
    ("野原", "のはら", "N4"),
    ("浜辺", "はまべ", "N4"),
    ("湖畔", "こはん", "N4"),
    ("河原", "かわら", "N4"),
    ("# ===== Wave 37: Emotional Verbs =====", None, None),
    ("溢れる", "あふれる", "N4"),
    ("抑える", "おさえる", "N4"),
    ("捉える", "とらえる", "N4"),
    ("甘える", "あまえる", "N4"),
    ("憎む", "にくむ", "N4"),
    ("羨む", "うらやむ", "N4"),
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
