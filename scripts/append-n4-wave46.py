# -*- coding: utf-8 -*-
"""Appends Wave 46 to jlpt-n4-vocab.csv.
Focus: targeted words from staging candidate probe (n4-candidates2.txt).
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE46 = [
    ("# ===== Wave 46: Feeling / Situation =====", None, None),
    ("窮屈", "きゅうくつ", "N4"),
    ("窮地", "きゅうち", "N4"),
    ("究極", "きゅうきょく", "N4"),
    ("巨大", "きょだい", "N4"),
    ("拒む", "こばむ", "N4"),
    ("拒絶", "きょぜつ", "N4"),
    ("# ===== Wave 46: Old / Former =====", None, None),
    ("旧式", "きゅうしき", "N4"),
    ("旧正月", "きゅうしょうがつ", "N4"),
    ("旧友", "きゅうゆう", "N4"),
    ("旧暦", "きゅうれき", "N4"),
    ("教養", "きょうよう", "N4"),
    ("# ===== Wave 46: Places / Lifestyle =====", None, None),
    ("居酒屋", "いざかや", "N4"),
    ("居眠り", "いねむり", "N4"),
    ("居残り", "いのこり", "N4"),
    ("去る", "さる", "N4"),
    ("# ===== Wave 46: Job / Society =====", None, None),
    ("求人", "きゅうじん", "N4"),
    ("求職", "きゅうしょく", "N4"),
    ("給食", "きゅうしょく", "N4"),
    ("給料日", "きゅうりょうび", "N4"),
    ("# ===== Wave 46: Crying / Emotions =====", None, None),
    ("泣き声", "なきごえ", "N4"),
    ("泣き虫", "なきむし", "N4"),
    ("泣き笑い", "なきわらい", "N4"),
    ("泣ける", "なける", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE46:
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
