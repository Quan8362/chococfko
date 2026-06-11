# -*- coding: utf-8 -*-
"""Appends Wave 25 N4 vocabulary to jlpt-n4-vocab.csv.
Focus: time of day, weather, food categories, cooking words.
"""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE25 = [
    ("# ===== Wave 25: Times of Day =====", None, None),
    ("夕暮れ", "ゆうぐれ", "N4"),
    ("夕焼け", "ゆうやけ", "N4"),
    ("夜明け", "よあけ", "N4"),
    ("明け方", "あけがた", "N4"),
    ("日暮れ", "ひぐれ", "N4"),
    ("昼下がり", "ひるさがり", "N4"),
    ("黄昏", "たそがれ", "N4"),
    ("# ===== Wave 25: Weather / Nature =====", None, None),
    ("吹雪", "ふぶき", "N4"),
    ("霰", "あられ", "N4"),
    ("靄", "もや", "N4"),
    ("雫", "しずく", "N4"),
    ("土砂降り", "どしゃぶり", "N4"),
    ("木陰", "こかげ", "N4"),
    ("木漏れ日", "こもれび", "N4"),
    ("波紋", "はもん", "N4"),
    ("# ===== Wave 25: Food Categories =====", None, None),
    ("煮物", "にもの", "N4"),
    ("焼き物", "やきもの", "N4"),
    ("揚げ物", "あげもの", "N4"),
    ("蒸し物", "むしもの", "N4"),
    ("漬物", "つけもの", "N4"),
    ("炊き込みご飯", "たきこみごはん", "N4"),
    ("酢の物", "すのもの", "N4"),
    ("# ===== Wave 25: Kitchen / Cooking =====", None, None),
    ("湯気", "ゆげ", "N4"),
    ("焦げ", "こげ", "N4"),
    ("煮込む", "にこむ", "N4"),
    ("炒める", "いためる", "N4"),
    ("蒸らす", "むらす", "N4"),
    ("揚げる", "あげる", "N4"),
    ("# ===== Wave 25: Dirt / Cleanliness =====", None, None),
    ("汚れ", "よごれ", "N4"),
    ("塵", "ちり", "N4"),
    ("埃", "ほこり", "N4"),
    ("垢", "あか", "N4"),
    ("# ===== Wave 25: Actions / Daily =====", None, None),
    ("走り回る", "はしりまわる", "N4"),
    ("書き直す", "かきなおす", "N4"),
    ("読み返す", "よみかえす", "N4"),
    ("聞き取れる", "ききとれる", "N4"),
    ("言い訳する", "いいわけする", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE25:
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
