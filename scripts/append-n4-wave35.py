# -*- coding: utf-8 -*-
"""Appends Wave 35 to jlpt-n4-vocab.csv.
Focus: insects/animals, plants/mushrooms, natural phenomena, colors.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE35 = [
    ("# ===== Wave 35: Insects / Small Animals =====", None, None),
    ("蝶", "ちょう", "N4"),
    ("蛍", "ほたる", "N4"),
    ("蜂", "はち", "N4"),
    ("蚊", "か", "N4"),
    ("鈴虫", "すずむし", "N4"),
    ("ツバメ", "ツバメ", "N4"),
    ("リス", "リス", "N4"),
    ("コウモリ", "コウモリ", "N4"),
    ("# ===== Wave 35: Plants / Mushrooms =====", None, None),
    ("菊", "きく", "N4"),
    ("蓮", "はす", "N4"),
    ("杉", "すぎ", "N4"),
    ("柿", "かき", "N4"),
    ("栗", "くり", "N4"),
    ("椎茸", "しいたけ", "N4"),
    ("松茸", "まつたけ", "N4"),
    ("# ===== Wave 35: Colors =====", None, None),
    ("藍色", "あいいろ", "N4"),
    ("金色", "きんいろ", "N4"),
    ("銀色", "ぎんいろ", "N4"),
    ("茜色", "あかねいろ", "N4"),
    ("# ===== Wave 35: Natural Phenomena / Landscape =====", None, None),
    ("地平線", "ちへいせん", "N4"),
    ("水平線", "すいへいせん", "N4"),
    ("空き地", "あきち", "N4"),
    ("空き家", "あきや", "N4"),
    ("地盤", "じばん", "N4"),
    ("地形", "ちけい", "N4"),
    ("地層", "ちそう", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE35:
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
