# -*- coding: utf-8 -*-
"""Appends Wave 32 to jlpt-n4-vocab.csv.
Focus: communication verbs, astronomy/weather, expressions.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE32 = [
    ("# ===== Wave 32: Communication Verbs =====", None, None),
    ("議論", "ぎろん", "N4"),
    ("交渉", "こうしょう", "N4"),
    ("宣言", "せんげん", "N4"),
    ("主張", "しゅちょう", "N4"),
    ("批判", "ひはん", "N4"),
    ("報告", "ほうこく", "N4"),
    ("訴える", "うったえる", "N4"),
    ("説得", "せっとく", "N4"),
    ("# ===== Wave 32: Weather Phenomena =====", None, None),
    ("霜", "しも", "N4"),
    ("雹", "ひょう", "N4"),
    ("露", "つゆ", "N4"),
    ("嵐", "あらし", "N4"),
    ("台風", "たいふう", "N4"),
    ("雷雨", "らいう", "N4"),
    ("# ===== Wave 32: Astronomy / Night Sky =====", None, None),
    ("満月", "まんげつ", "N4"),
    ("新月", "しんげつ", "N4"),
    ("三日月", "みかづき", "N4"),
    ("流れ星", "ながれぼし", "N4"),
    ("日食", "にっしょく", "N4"),
    ("月食", "げっしょく", "N4"),
    ("天の川", "あまのがわ", "N4"),
    ("# ===== Wave 32: Adjective Expressions =====", None, None),
    ("うとうと", "うとうと", "N4"),
    ("のんびり", "のんびり", "N4"),
    ("こっそり", "こっそり", "N4"),
    ("そっと", "そっと", "N4"),
    ("ぐっすり", "ぐっすり", "N4"),
    ("しっかり", "しっかり", "N4"),
    ("ふらふら", "ふらふら", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE32:
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
