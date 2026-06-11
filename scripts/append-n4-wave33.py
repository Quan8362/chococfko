# -*- coding: utf-8 -*-
"""Appends Wave 33 to jlpt-n4-vocab.csv.
Focus: medical/hospital, shopping, travel, family.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE33 = [
    ("# ===== Wave 33: Medical / Hospital =====", None, None),
    ("診察", "しんさつ", "N4"),
    ("診断", "しんだん", "N4"),
    ("手術", "しゅじゅつ", "N4"),
    ("入院", "にゅういん", "N4"),
    ("退院", "たいいん", "N4"),
    ("注射", "ちゅうしゃ", "N4"),
    ("血圧", "けつあつ", "N4"),
    ("体温", "たいおん", "N4"),
    ("血液", "けつえき", "N4"),
    ("処方箋", "しょほうせん", "N4"),
    ("# ===== Wave 33: Shopping / Money =====", None, None),
    ("割引", "わりびき", "N4"),
    ("値引き", "ねびき", "N4"),
    ("支払い", "しはらい", "N4"),
    ("お釣り", "おつり", "N4"),
    ("消費税", "しょうひぜい", "N4"),
    ("試着", "しちゃく", "N4"),
    ("両替", "りょうがえ", "N4"),
    ("# ===== Wave 33: Travel =====", None, None),
    ("観光地", "かんこうち", "N4"),
    ("名所", "めいしょ", "N4"),
    ("土産", "みやげ", "N4"),
    ("旅行者", "りょこうしゃ", "N4"),
    ("出発点", "しゅっぱつてん", "N4"),
    ("# ===== Wave 33: Family / Relationships =====", None, None),
    ("姑", "しゅうとめ", "N4"),
    ("舅", "しゅうと", "N4"),
    ("義理の兄", "ぎりのあに", "N4"),
    ("義理の姉", "ぎりのあね", "N4"),
    ("義理の弟", "ぎりのおとうと", "N4"),
    ("義理の妹", "ぎりのいもうと", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE33:
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
