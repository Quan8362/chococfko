# -*- coding: utf-8 -*-
"""Appends Wave 49 to jlpt-n4-vocab.csv.
Focus: 経/継/繋/計/系 vocabulary — manage/pass/connect/calculate.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE49 = [
    ("# ===== Wave 49: Pass / Elapse =====", None, None),
    ("経つ", "たつ", "N4"),
    ("経る", "へる", "N4"),
    ("経過", "けいか", "N4"),
    ("経路", "けいろ", "N4"),
    ("# ===== Wave 49: Management / Career =====", None, None),
    ("経営", "けいえい", "N4"),
    ("経営者", "けいえいしゃ", "N4"),
    ("経費", "けいひ", "N4"),
    ("経歴", "けいれき", "N4"),
    ("経理", "けいり", "N4"),
    ("# ===== Wave 49: Inherit / Continue =====", None, None),
    ("継ぐ", "つぐ", "N4"),
    ("継続", "けいぞく", "N4"),
    ("継承", "けいしょう", "N4"),
    ("継子", "ままこ", "N4"),
    ("継父", "けいふ", "N4"),
    ("継母", "ままはは", "N4"),
    ("# ===== Wave 49: Connect / Link =====", None, None),
    ("繋がり", "つながり", "N4"),
    ("繋がる", "つながる", "N4"),
    ("繋ぐ", "つなぐ", "N4"),
    ("繋げる", "つなげる", "N4"),
    ("# ===== Wave 49: Calculate / System =====", None, None),
    ("計算", "けいさん", "N4"),
    ("計測", "けいそく", "N4"),
    ("系統", "けいとう", "N4"),
    ("系列", "けいれつ", "N4"),
    ("# ===== Wave 49: Notice / Post =====", None, None),
    ("掲げる", "かかげる", "N4"),
    ("掲示", "けいじ", "N4"),
    ("掲示板", "けいじばん", "N4"),
    ("掲載", "けいさい", "N4"),
    ("# ===== Wave 49: Carry / Engage =====", None, None),
    ("携わる", "たずさわる", "N4"),
    ("携える", "たずさえる", "N4"),
    ("# ===== Wave 49: Form / Shape =====", None, None),
    ("形成", "けいせい", "N4"),
    ("形式", "けいしき", "N4"),
    ("形跡", "けいせき", "N4"),
    ("茎", "くき", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE49:
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
