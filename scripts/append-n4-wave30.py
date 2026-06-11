# -*- coding: utf-8 -*-
"""Appends Wave 30 to jlpt-n4-vocab.csv.
Focus: compound verbs, abstract concepts, household appliances/items.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE30 = [
    ("# ===== Wave 30: Compound Verbs =====", None, None),
    ("振り返る", "ふりかえる", "N4"),
    ("乗り越える", "のりこえる", "N4"),
    ("打ち明ける", "うちあける", "N4"),
    ("打ち込む", "うちこむ", "N4"),
    ("引き受ける", "ひきうける", "N4"),
    ("取り組む", "とりくむ", "N4"),
    ("取り除く", "とりのぞく", "N4"),
    ("成し遂げる", "なしとげる", "N4"),
    ("見落とす", "みおとす", "N4"),
    ("見直す", "みなおす", "N4"),
    ("立ち上がる", "たちあがる", "N4"),
    ("踏み出す", "ふみだす", "N4"),
    ("# ===== Wave 30: Abstract / Conceptual =====", None, None),
    ("意志", "いし", "N4"),
    ("意図", "いと", "N4"),
    ("動機", "どうき", "N4"),
    ("方針", "ほうしん", "N4"),
    ("原則", "げんそく", "N4"),
    ("例外", "れいがい", "N4"),
    ("基準", "きじゅん", "N4"),
    ("傾向", "けいこう", "N4"),
    ("過程", "かてい", "N4"),
    ("# ===== Wave 30: Household Appliances =====", None, None),
    ("洗濯物", "せんたくもの", "N4"),
    ("掃除機", "そうじき", "N4"),
    ("炊飯器", "すいはんき", "N4"),
    ("まな板", "まないた", "N4"),
    ("やかん", "やかん", "N4"),
    ("ざる", "ざる", "N4"),
    ("鍋蓋", "なべぶた", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE30:
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
