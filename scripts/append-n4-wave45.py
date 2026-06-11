# -*- coding: utf-8 -*-
"""Appends Wave 45 to jlpt-n4-vocab.csv.
Focus: staging candidates identified in n4-candidates.txt — useful N4 vocab words.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE45 = [
    ("# ===== Wave 45: Time / Frequency Expressions =====", None, None),
    ("一瞬", "いっしゅん", "N4"),
    ("一時的", "いちじてき", "N4"),
    ("一時間", "いちじかん", "N4"),
    ("一周年", "いっしゅうねん", "N4"),
    ("一休み", "ひとやすみ", "N4"),
    ("# ===== Wave 45: Effort / Character Expressions =====", None, None),
    ("一所懸命", "いっしょけんめい", "N4"),
    ("一心", "いっしん", "N4"),
    ("一新", "いっしん", "N4"),
    ("一人前", "いちにんまえ", "N4"),
    ("一種", "いっしゅ", "N4"),
    ("一式", "いっしき", "N4"),
    ("# ===== Wave 45: Basic Compass / Direction =====", None, None),
    ("西", "にし", "N4"),
    ("南", "みなみ", "N4"),
    ("北", "きた", "N4"),
    ("東", "ひがし", "N4"),
    ("# ===== Wave 45: Household / Cooking Items =====", None, None),
    ("カツ丼", "カツどん", "N4"),
    ("火花", "ひばな", "N4"),
    ("ウーロン茶", "ウーロンちゃ", "N4"),
    ("# ===== Wave 45: Useful Adverbs / Common Expressions =====", None, None),
    ("ちょっと", "ちょっと", "N4"),
    ("一際", "ひときわ", "N4"),
    ("一向", "いっこう", "N4"),
    ("一概に", "いちがいに", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE45:
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
