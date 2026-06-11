# -*- coding: utf-8 -*-
"""Appends Wave 21 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE21 = [
    ("# ===== Wave 21: Verbs of Change =====", None, None),
    ("変わり果てる", "かわりはてる", "N4"),
    ("成り立つ", "なりたつ", "N4"),
    ("成り行き", "なりゆき", "N4"),
    ("生まれ変わる", "うまれかわる", "N4"),
    ("生き残る", "いきのこる", "N4"),
    ("立ち直る", "たちなおる", "N4"),
    ("立ち上がる", "たちあがる", "N4"),
    ("立ち向かう", "たちむかう", "N4"),
    ("追い越す", "おいこす", "N4"),
    ("追い付く", "おいつく", "N4"),
    ("追い求める", "おいもとめる", "N4"),
    ("# ===== Wave 21: Personal Habits =====", None, None),
    ("習慣", "しゅうかん", "N4"),
    ("癖", "くせ", "N4"),
    ("口癖", "くちぐせ", "N4"),
    ("寝癖", "ねぐせ", "N4"),
    ("几帳面さ", "きちょうめんさ", "N4"),
    ("怠け者", "なまけもの", "N4"),
    ("働き者", "はたらきもの", "N4"),
    ("頑張り屋", "がんばりや", "N4"),
    ("# ===== Wave 21: Opinions / Arguments =====", None, None),
    ("賛成", "さんせい", "N4"),
    ("反対", "はんたい", "N4"),
    ("賛否", "さんぴ", "N4"),
    ("議論", "ぎろん", "N4"),
    ("討論", "とうろん", "N4"),
    ("主張", "しゅちょう", "N4"),
    ("立場", "たちば", "N4"),
    ("見解", "けんかい", "N4"),
    ("批判", "ひはん", "N4"),
    ("批評", "ひひょう", "N4"),
    ("# ===== Wave 21: Medical / Health Terms =====", None, None),
    ("応急処置", "おうきゅうしょち", "N4"),
    ("体温計", "たいおんけい", "N4"),
    ("血圧計", "けつあつけい", "N4"),
    ("聴診器", "ちょうしんき", "N4"),
    ("包帯", "ほうたい", "N4"),
    ("絆創膏", "ばんそうこう", "N4"),
    ("湿布", "しっぷ", "N4"),
    ("点滴", "てんてき", "N4"),
    ("注射", "ちゅうしゃ", "N4"),
    ("# ===== Wave 21: Countryside / Landscape =====", None, None),
    ("田んぼ", "たんぼ", "N4"),
    ("畑", "はたけ", "N4"),
    ("牧場", "ぼくじょう", "N4"),
    ("農村", "のうそん", "N4"),
    ("漁村", "ぎょそん", "N4"),
    ("山村", "さんそん", "N4"),
    ("渓谷", "けいこく", "N4"),
    ("滝", "たき", "N4"),
    ("洞窟", "どうくつ", "N4"),
    ("岬", "みさき", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE21:
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
