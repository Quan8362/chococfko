# -*- coding: utf-8 -*-
"""Appends Wave 20b N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE20B = [
    ("# ===== Wave 20b: Daily Body Actions =====", None, None),
    ("深呼吸", "しんこきゅう", "N4"),
    ("あくび", "あくび", "N4"),
    ("くしゃみ", "くしゃみ", "N4"),
    ("しゃっくり", "しゃっくり", "N4"),
    ("まばたき", "まばたき", "N4"),
    ("ため息", "ためいき", "N4"),
    ("鼻をかむ", "はなをかむ", "N4"),
    ("うなずく", "うなずく", "N4"),
    ("首を振る", "くびをふる", "N4"),
    ("腕を組む", "うでをくむ", "N4"),
    ("# ===== Wave 20b: Household Items =====", None, None),
    ("洗濯機", "せんたくき", "N4"),
    ("乾燥機", "かんそうき", "N4"),
    ("炊飯器", "すいはんき", "N4"),
    ("電子レンジ", "でんしレンジ", "N4"),
    ("食洗機", "しょくせんき", "N4"),
    ("掃除機", "そうじき", "N4"),
    ("冷凍庫", "れいとうこ", "N4"),
    ("加湿器", "かしつき", "N4"),
    ("空気清浄機", "くうきせいじょうき", "N4"),
    ("# ===== Wave 20b: Sport / Exercise =====", None, None),
    ("ウォーミングアップ", "ウォーミングアップ", "N4"),
    ("クールダウン", "クールダウン", "N4"),
    ("ストレッチ", "ストレッチ", "N4"),
    ("筋トレ", "きんトレ", "N4"),
    ("有酸素運動", "ゆうさんそうんどう", "N4"),
    ("無酸素運動", "むさんそうんどう", "N4"),
    ("スポーツジム", "スポーツジム", "N4"),
    ("水泳", "すいえい", "N4"),
    ("陸上競技", "りくじょうきょうぎ", "N4"),
    ("# ===== Wave 20b: Special Occasions =====", None, None),
    ("成人式", "せいじんしき", "N4"),
    ("七五三", "しちごさん", "N4"),
    ("お盆", "おぼん", "N4"),
    ("節分", "せつぶん", "N4"),
    ("桃の節句", "もものせっく", "N4"),
    ("端午の節句", "たんごのせっく", "N4"),
    ("お彼岸", "おひがん", "N4"),
    ("大みそか", "おおみそか", "N4"),
    ("初詣", "はつもうで", "N4"),
    ("# ===== Wave 20b: Directions / Instructions =====", None, None),
    ("手順", "てじゅん", "N4"),
    ("段取り", "だんどり", "N4"),
    ("段階", "だんかい", "N4"),
    ("順序", "じゅんじょ", "N4"),
    ("順番", "じゅんばん", "N4"),
    ("交代", "こうたい", "N4"),
    ("交互", "こうご", "N4"),
    ("同時", "どうじ", "N4"),
    ("並行", "へいこう", "N4"),
    ("連続", "れんぞく", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE20B:
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
