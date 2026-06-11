# -*- coding: utf-8 -*-
"""Appends Wave 27 to jlpt-n4-vocab.csv.
Focus: nature/seasons, workplace, body, relationships.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE27 = [
    ("# ===== Wave 27: Seasonal Nature =====", None, None),
    ("春雨", "はるさめ", "N4"),
    ("秋風", "あきかぜ", "N4"),
    ("初雪", "はつゆき", "N4"),
    ("花びら", "はなびら", "N4"),
    ("枯れ葉", "かれは", "N4"),
    ("紅葉", "こうよう", "N4"),
    ("朝露", "あさつゆ", "N4"),
    ("花見", "はなみ", "N4"),
    ("砂浜", "すなはま", "N4"),
    ("水面", "すいめん", "N4"),
    ("川岸", "かわぎし", "N4"),
    ("峠", "とうげ", "N4"),
    ("# ===== Wave 27: Body Parts =====", None, None),
    ("肌", "はだ", "N4"),
    ("唇", "くちびる", "N4"),
    ("眉毛", "まゆげ", "N4"),
    ("まぶた", "まぶた", "N4"),
    ("のど", "のど", "N4"),
    ("ひじ", "ひじ", "N4"),
    ("ひざ", "ひざ", "N4"),
    ("指先", "ゆびさき", "N4"),
    ("# ===== Wave 27: Workplace =====", None, None),
    ("上司", "じょうし", "N4"),
    ("部下", "ぶか", "N4"),
    ("同僚", "どうりょう", "N4"),
    ("残業", "ざんぎょう", "N4"),
    ("出張", "しゅっちょう", "N4"),
    ("給料", "きゅうりょう", "N4"),
    ("昇進", "しょうしん", "N4"),
    ("転職", "てんしょく", "N4"),
    ("退職", "たいしょく", "N4"),
    ("# ===== Wave 27: Relationships =====", None, None),
    ("親戚", "しんせき", "N4"),
    ("知人", "ちじん", "N4"),
    ("隣人", "りんじん", "N4"),
    ("友人", "ゆうじん", "N4"),
    ("恩人", "おんじん", "N4"),
    ("恩師", "おんし", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE27:
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
