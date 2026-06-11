# -*- coding: utf-8 -*-
"""Appends Wave 48 to jlpt-n4-vocab.csv.
Focus: ent_seq 1200000-1252xxx candidates — sea/reform/open/culture vocabulary.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE48 = [
    ("# ===== Wave 48: Pleasant / Puzzled =====", None, None),
    ("快感", "かいかん", "N4"),
    ("怪訝", "けげん", "N4"),
    ("# ===== Wave 48: Everyday Objects =====", None, None),
    ("懐中電灯", "かいちゅうでんとう", "N4"),
    ("貝殻", "かいがら", "N4"),
    ("# ===== Wave 48: Reform / Law =====", None, None),
    ("改革", "かいかく", "N4"),
    ("改正", "かいせい", "N4"),
    ("改定", "かいてい", "N4"),
    ("# ===== Wave 48: Sea / Nature =====", None, None),
    ("海峡", "かいきょう", "N4"),
    ("海軍", "かいぐん", "N4"),
    ("海上", "かいじょう", "N4"),
    ("海草", "かいそう", "N4"),
    ("海豚", "いるか", "N4"),
    ("# ===== Wave 48: Attendance / Existence =====", None, None),
    ("皆勤", "かいきん", "N4"),
    ("皆無", "かいむ", "N4"),
    ("# ===== Wave 48: Opening / Business =====", None, None),
    ("開業", "かいぎょう", "N4"),
    ("開催", "かいさい", "N4"),
    ("開演", "かいえん", "N4"),
    ("開発", "かいはつ", "N4"),
    ("開店", "かいてん", "N4"),
    ("開放", "かいほう", "N4"),
    ("# ===== Wave 48: Society / Class =====", None, None),
    ("階級", "かいきゅう", "N4"),
    ("# ===== Wave 48: Keepsake / Learning =====", None, None),
    ("形見", "かたみ", "N4"),
    ("契機", "けいき", "N4"),
    ("携帯", "けいたい", "N4"),
    ("稽古", "けいこ", "N4"),
    ("# ===== Wave 48: Respect / Scenery =====", None, None),
    ("敬礼", "けいれい", "N4"),
    ("景色", "けしき", "N4"),
    ("恵み", "めぐみ", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE48:
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
