# -*- coding: utf-8 -*-
"""Appends Wave 43 to jlpt-n4-vocab.csv.
Focus: compound expressions, adverbs of degree, medical/body terms, workplace nouns.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE43 = [
    ("# ===== Wave 43: Adverbs of Degree / Manner =====", None, None),
    ("わずか", "わずか", "N4"),
    ("たった", "たった", "N4"),
    ("ずいぶん", "ずいぶん", "N4"),
    ("かなり", "かなり", "N4"),
    ("相当", "そうとう", "N4"),
    ("なるべく", "なるべく", "N4"),
    ("できるだけ", "できるだけ", "N4"),
    ("いっそ", "いっそ", "N4"),
    ("せっかく", "せっかく", "N4"),
    ("# ===== Wave 43: Medical / Body =====", None, None),
    ("注射", "ちゅうしゃ", "N4"),
    ("手術", "しゅじゅつ", "N4"),
    ("検査", "けんさ", "N4"),
    ("処方", "しょほう", "N4"),
    ("診断", "しんだん", "N4"),
    ("入院", "にゅういん", "N4"),
    ("退院", "たいいん", "N4"),
    ("救急", "きゅうきゅう", "N4"),
    ("# ===== Wave 43: Workplace / Office =====", None, None),
    ("会議", "かいぎ", "N4"),
    ("書類", "しょるい", "N4"),
    ("担当", "たんとう", "N4"),
    ("上司", "じょうし", "N4"),
    ("部下", "ぶか", "N4"),
    ("同僚", "どうりょう", "N4"),
    ("残業", "ざんぎょう", "N4"),
    ("出張", "しゅっちょう", "N4"),
    ("昇進", "しょうしん", "N4"),
    ("# ===== Wave 43: Quantity / Math =====", None, None),
    ("半分", "はんぶん", "N4"),
    ("倍", "ばい", "N4"),
    ("割", "わり", "N4"),
    ("以上", "いじょう", "N4"),
    ("以下", "いか", "N4"),
    ("約", "やく", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE43:
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
