# -*- coding: utf-8 -*-
"""Appends Wave 44 to jlpt-n4-vocab.csv.
Focus: less common N4 vocab — keigo expressions, conjunctions, specific action verbs.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE44 = [
    ("# ===== Wave 44: Keigo / Polite Expressions =====", None, None),
    ("いらっしゃる", "いらっしゃる", "N4"),
    ("おっしゃる", "おっしゃる", "N4"),
    ("ございます", "ございます", "N4"),
    ("いただく", "いただく", "N4"),
    ("くださる", "くださる", "N4"),
    ("なさる", "なさる", "N4"),
    ("まいる", "まいる", "N4"),
    ("もうす", "もうす", "N4"),
    ("おる", "おる", "N4"),
    ("# ===== Wave 44: Conjunctions / Connectives =====", None, None),
    ("したがって", "したがって", "N4"),
    ("ところが", "ところが", "N4"),
    ("それでも", "それでも", "N4"),
    ("そのため", "そのため", "N4"),
    ("なお", "なお", "N4"),
    ("また", "また", "N4"),
    ("あるいは", "あるいは", "N4"),
    ("もしくは", "もしくは", "N4"),
    ("# ===== Wave 44: Specific Action Verbs =====", None, None),
    ("踏む", "ふむ", "N4"),
    ("握る", "にぎる", "N4"),
    ("押さえる", "おさえる", "N4"),
    ("引っ張る", "ひっぱる", "N4"),
    ("ひっくり返す", "ひっくりかえす", "N4"),
    ("詰める", "つめる", "N4"),
    ("並べる", "ならべる", "N4"),
    ("まとめる", "まとめる", "N4"),
    ("# ===== Wave 44: Degree / Emphasis =====", None, None),
    ("せめて", "せめて", "N4"),
    ("少なくとも", "すくなくとも", "N4"),
    ("たとえば", "たとえば", "N4"),
    ("つまり", "つまり", "N4"),
    ("むしろ", "むしろ", "N4"),
    ("かえって", "かえって", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE44:
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
