# -*- coding: utf-8 -*-
"""Appends Wave 16 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE16 = [
    ("# ===== Wave 16: More Verb Pairs =====", None, None),
    ("繰り返す", "くりかえす", "N4"),
    ("残す", "のこす", "N4"),
    ("残る", "のこる", "N4"),
    ("伸ばす", "のばす", "N4"),
    ("伸びる", "のびる", "N4"),
    ("縮む", "ちぢむ", "N4"),
    ("広げる", "ひろげる", "N4"),
    ("広がる", "ひろがる", "N4"),
    ("高める", "たかめる", "N4"),
    ("高まる", "たかまる", "N4"),
    ("下げる", "さげる", "N4"),
    ("下がる", "さがる", "N4"),
    ("済む", "すむ", "N4"),
    ("# ===== Wave 16: Specific Action Verbs =====", None, None),
    ("揺れる", "ゆれる", "N4"),
    ("揺らぐ", "ゆらぐ", "N4"),
    ("染める", "そめる", "N4"),
    ("染まる", "そまる", "N4"),
    ("濡れる", "ぬれる", "N4"),
    ("濡らす", "ぬらす", "N4"),
    ("汚れる", "よごれる", "N4"),
    ("汚す", "よごす", "N4"),
    ("壊れる", "こわれる", "N4"),
    ("壊す", "こわす", "N4"),
    ("直る", "なおる", "N4"),
    ("直す", "なおす", "N4"),
    ("冷える", "ひえる", "N4"),
    ("# ===== Wave 16: Social / Interpersonal =====", None, None),
    ("付き合い", "つきあい", "N4"),
    ("仲良し", "なかよし", "N4"),
    ("仲間", "なかま", "N4"),
    ("仲直り", "なかなおり", "N4"),
    ("仲裁", "ちゅうさい", "N4"),
    ("相談相手", "そうだんあいて", "N4"),
    ("話し相手", "はなしあいて", "N4"),
    ("# ===== Wave 16: Numbers / Quantities =====", None, None),
    ("倍", "ばい", "N4"),
    ("半分", "はんぶん", "N4"),
    ("三分の一", "さんぶんのいち", "N4"),
    ("四分の一", "しぶんのいち", "N4"),
    ("割合", "わりあい", "N4"),
    ("比率", "ひりつ", "N4"),
    ("平均", "へいきん", "N4"),
    ("合計", "ごうけい", "N4"),
    ("小計", "しょうけい", "N4"),
    ("# ===== Wave 16: Daily Expressions =====", None, None),
    ("お疲れ様", "おつかれさま", "N4"),
    ("お世話になる", "おせわになる", "N4"),
    ("よろしくお願い", "よろしくおねがい", "N4"),
    ("失礼します", "しつれいします", "N4"),
    ("お邪魔します", "おじゃまします", "N4"),
    ("ご遠慮なく", "ごえんりょなく", "N4"),
    ("お気をつけて", "おきをつけて", "N4"),
    ("# ===== Wave 16: Shapes / Appearance =====", None, None),
    ("形", "かたち", "N4"),
    ("形状", "けいじょう", "N4"),
    ("模様", "もよう", "N4"),
    ("輪郭", "りんかく", "N4"),
    ("外観", "がいかん", "N4"),
    ("外見", "がいけん", "N4"),
    ("印象", "いんしょう", "N4"),
    ("見た目", "みため", "N4"),
    ("# ===== Wave 16: Abstract Concepts =====", None, None),
    ("概念", "がいねん", "N4"),
    ("理論", "りろん", "N4"),
    ("仮定", "かてい", "N4"),
    ("前提", "ぜんてい", "N4"),
    ("結論付ける", "けつろんづける", "N4"),
    ("証明", "しょうめい", "N4"),
    ("根拠", "こんきょ", "N4"),
    ("証拠", "しょうこ", "N4"),
    ("# ===== Wave 16: Environment / Weather =====", None, None),
    ("日照り", "ひでり", "N4"),
    ("吹雪", "ふぶき", "N4"),
    ("嵐", "あらし", "N4"),
    ("豪雨", "ごうう", "N4"),
    ("梅雨", "つゆ", "N4"),
    ("湿気", "しっけ", "N4"),
    ("湿度", "しつど", "N4"),
    ("乾燥", "かんそう", "N4"),
    ("気候", "きこう", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE16:
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
