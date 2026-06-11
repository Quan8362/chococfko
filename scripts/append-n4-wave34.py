# -*- coding: utf-8 -*-
"""Appends Wave 34 to jlpt-n4-vocab.csv.
Focus: finance/economy, legal, food/dashi, entertainment.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE34 = [
    ("# ===== Wave 34: Finance / Economy =====", None, None),
    ("節約", "せつやく", "N4"),
    ("浪費", "ろうひ", "N4"),
    ("借金", "しゃっきん", "N4"),
    ("利息", "りそく", "N4"),
    ("投資", "とうし", "N4"),
    ("景気", "けいき", "N4"),
    ("不況", "ふきょう", "N4"),
    ("# ===== Wave 34: Legal / Crime =====", None, None),
    ("裁判", "さいばん", "N4"),
    ("弁護士", "べんごし", "N4"),
    ("犯人", "はんにん", "N4"),
    ("証拠", "しょうこ", "N4"),
    ("逮捕", "たいほ", "N4"),
    ("釈放", "しゃくほう", "N4"),
    ("# ===== Wave 34: Japanese Food & Cooking =====", None, None),
    ("出汁", "だし", "N4"),
    ("みりん", "みりん", "N4"),
    ("昆布", "こんぶ", "N4"),
    ("鰹節", "かつおぶし", "N4"),
    ("酢", "す", "N4"),
    ("麹", "こうじ", "N4"),
    ("# ===== Wave 34: Entertainment / Media =====", None, None),
    ("声優", "せいゆう", "N4"),
    ("漫画家", "まんがか", "N4"),
    ("監督", "かんとく", "N4"),
    ("舞台", "ぶたい", "N4"),
    ("脚本", "きゃくほん", "N4"),
    ("上映", "じょうえい", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE34:
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
