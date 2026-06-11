# -*- coding: utf-8 -*-
"""Appends Wave 47 to jlpt-n4-vocab.csv.
Focus: ent_seq 1200000-1202xxx candidates — reform/regret/sea/art/food vocabulary.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE47 = [
    ("# ===== Wave 47: Pleasant / Positive States =====", None, None),
    ("快適", "かいてき", "N4"),
    ("快速", "かいそく", "N4"),
    ("快調", "かいちょう", "N4"),
    ("快眠", "かいみん", "N4"),
    ("# ===== Wave 47: Ghost / Fantasy =====", None, None),
    ("怪獣", "かいじゅう", "N4"),
    ("怪談", "かいだん", "N4"),
    ("怪力", "かいりき", "N4"),
    ("# ===== Wave 47: Regret / Emotion =====", None, None),
    ("悔い", "くい", "N4"),
    ("悔しさ", "くやしさ", "N4"),
    ("悔やむ", "くやむ", "N4"),
    ("懐く", "なつく", "N4"),
    ("# ===== Wave 47: Reform / Improve =====", None, None),
    ("改まる", "あらたまる", "N4"),
    ("改める", "あらためる", "N4"),
    ("改心", "かいしん", "N4"),
    ("改善", "かいぜん", "N4"),
    ("改良", "かいりょう", "N4"),
    ("改装", "かいそう", "N4"),
    ("# ===== Wave 47: Sea / Outdoor =====", None, None),
    ("海水", "かいすい", "N4"),
    ("海水浴", "かいすいよく", "N4"),
    ("海辺", "うみべ", "N4"),
    ("海苔", "のり", "N4"),
    ("海賊", "かいぞく", "N4"),
    ("# ===== Wave 47: Art / Everyday =====", None, None),
    ("絵の具", "えのぐ", "N4"),
    ("絵本", "えほん", "N4"),
    ("開花", "かいか", "N4"),
    ("灰皿", "はいざら", "N4"),
    ("皆様", "みなさま", "N4"),
    ("辛子", "からし", "N4"),
    ("蟹", "かに", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE47:
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
