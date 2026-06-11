# -*- coding: utf-8 -*-
"""Appends Wave 22b N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE22B = [
    ("# ===== Wave 22b: Single-kanji Verbs =====", None, None),
    ("潜る", "もぐる", "N4"),
    ("浮く", "うく", "N4"),
    ("沈む", "しずむ", "N4"),
    ("流れる", "ながれる", "N4"),
    ("溢れる", "あふれる", "N4"),
    ("湧く", "わく", "N4"),
    ("噴く", "ふく", "N4"),
    ("滲む", "にじむ", "N4"),
    ("零れる", "こぼれる", "N4"),
    ("乾く", "かわく", "N4"),
    ("# ===== Wave 22b: Specific Adjectives =====", None, None),
    ("生温かい", "なまぬるい", "N4"),
    ("生意気", "なまいき", "N4"),
    ("生真面目", "きまじめ", "N4"),
    ("物静か", "ものしずか", "N4"),
    ("用心深い", "ようじんぶかい", "N4"),
    ("情け深い", "なさけぶかい", "N4"),
    ("奥深い", "おくぶかい", "N4"),
    ("根深い", "ねぶかい", "N4"),
    ("力強い", "ちからづよい", "N4"),
    ("# ===== Wave 22b: Body / Physical =====", None, None),
    ("眉毛", "まゆげ", "N4"),
    ("睫毛", "まつげ", "N4"),
    ("鼻孔", "びこう", "N4"),
    ("耳たぶ", "みみたぶ", "N4"),
    ("頬骨", "ほおぼね", "N4"),
    ("あごひげ", "あごひげ", "N4"),
    ("こめかみ", "こめかみ", "N4"),
    ("首筋", "くびすじ", "N4"),
    ("脇腹", "わきばら", "N4"),
    ("足首", "あしくび", "N4"),
    ("# ===== Wave 22b: Cooking Nouns =====", None, None),
    ("おかず", "おかず", "N4"),
    ("汁物", "しるもの", "N4"),
    ("副食", "ふくしょく", "N4"),
    ("主食", "しゅしょく", "N4"),
    ("間食", "かんしょく", "N4"),
    ("夜食", "やしょく", "N4"),
    ("軽食", "けいしょく", "N4"),
    ("和食", "わしょく", "N4"),
    ("洋食", "ようしょく", "N4"),
    ("中華料理", "ちゅうかりょうり", "N4"),
    ("# ===== Wave 22b: Seasons / Weather =====", None, None),
    ("春雨", "はるさめ", "N4"),
    ("夕立", "ゆうだち", "N4"),
    ("小雨", "こさめ", "N4"),
    ("霧雨", "きりさめ", "N4"),
    ("氷雨", "ひさめ", "N4"),
    ("霜", "しも", "N4"),
    ("霜柱", "しもばしら", "N4"),
    ("薄氷", "うすごおり", "N4"),
    ("初雪", "はつゆき", "N4"),
    ("新雪", "しんせつ", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE22B:
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
