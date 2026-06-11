# -*- coding: utf-8 -*-
"""Appends Wave 28 to jlpt-n4-vocab.csv.
Focus: health/medical, household, transportation, business.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE28 = [
    ("# ===== Wave 28: Health & Body =====", None, None),
    ("咳", "せき", "N4"),
    ("くしゃみ", "くしゃみ", "N4"),
    ("鼻水", "はなみず", "N4"),
    ("鼻血", "はなぢ", "N4"),
    ("傷", "きず", "N4"),
    ("傷跡", "きずあと", "N4"),
    ("骨折", "こっせつ", "N4"),
    ("捻挫", "ねんざ", "N4"),
    ("下痢", "げり", "N4"),
    ("めまい", "めまい", "N4"),
    ("発熱", "はつねつ", "N4"),
    ("# ===== Wave 28: Household =====", None, None),
    ("棚", "たな", "N4"),
    ("引き出し", "ひきだし", "N4"),
    ("戸棚", "とだな", "N4"),
    ("押し入れ", "おしいれ", "N4"),
    ("縁側", "えんがわ", "N4"),
    ("畳", "たたみ", "N4"),
    ("障子", "しょうじ", "N4"),
    ("ふすま", "ふすま", "N4"),
    ("# ===== Wave 28: Transportation =====", None, None),
    ("定期券", "ていきけん", "N4"),
    ("終電", "しゅうでん", "N4"),
    ("始発", "しはつ", "N4"),
    ("時刻表", "じこくひょう", "N4"),
    ("渋滞", "じゅうたい", "N4"),
    ("# ===== Wave 28: Work / Business =====", None, None),
    ("領収書", "りょうしゅうしょ", "N4"),
    ("見積もり", "みつもり", "N4"),
    ("契約", "けいやく", "N4"),
    ("期限", "きげん", "N4"),
    ("締め切り", "しめきり", "N4"),
    ("会計", "かいけい", "N4"),
    ("請求書", "せいきゅうしょ", "N4"),
    ("納期", "のうき", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE28:
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
