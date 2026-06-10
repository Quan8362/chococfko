# -*- coding: utf-8 -*-
"""Appends Wave 18 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE18 = [
    ("# ===== Wave 18: Specific Compound Nouns =====", None, None),
    ("思いやり", "おもいやり", "N4"),
    ("気配り", "きくばり", "N4"),
    ("心配り", "こころくばり", "N4"),
    ("心がけ", "こころがけ", "N4"),
    ("気遣い", "きづかい", "N4"),
    ("心掛ける", "こころがける", "N4"),
    ("見直す", "みなおす", "N4"),
    ("見極める", "みきわめる", "N4"),
    ("見渡す", "みわたす", "N4"),
    ("見逃す", "みのがす", "N4"),
    ("聞き逃す", "ききのがす", "N4"),
    ("言い訳", "いいわけ", "N4"),
    ("# ===== Wave 18: Verbs of Thinking/Knowing =====", None, None),
    ("気づく", "きづく", "N4"),
    ("判断する", "はんだんする", "N4"),
    ("比較する", "ひかくする", "N4"),
    ("検討する", "けんとうする", "N4"),
    ("確認する", "かくにんする", "N4"),
    ("把握する", "はあくする", "N4"),
    ("理解する", "りかいする", "N4"),
    ("評価する", "ひょうかする", "N4"),
    ("# ===== Wave 18: Objects / Things =====", None, None),
    ("鍵盤", "けんばん", "N4"),
    ("棚卸し", "たなおろし", "N4"),
    ("在庫", "ざいこ", "N4"),
    ("見本", "みほん", "N4"),
    ("手本", "てほん", "N4"),
    ("サンプル", "サンプル", "N4"),
    ("原材料", "げんざいりょう", "N4"),
    ("完成品", "かんせいひん", "N4"),
    ("部品", "ぶひん", "N4"),
    ("道具", "どうぐ", "N4"),
    ("# ===== Wave 18: Size / Measurement =====", None, None),
    ("寸法", "すんぽう", "N4"),
    ("面積", "めんせき", "N4"),
    ("体積", "たいせき", "N4"),
    ("容積", "ようせき", "N4"),
    ("重量", "じゅうりょう", "N4"),
    ("容量", "ようりょう", "N4"),
    ("密度", "みつど", "N4"),
    ("濃度", "のうど", "N4"),
    ("温度", "おんど", "N4"),
    ("湿度", "しつど", "N4"),
    ("# ===== Wave 18: Daily Life Verbs =====", None, None),
    ("調べ直す", "しらべなおす", "N4"),
    ("書き直す", "かきなおす", "N4"),
    ("読み返す", "よみかえす", "N4"),
    ("やり直す", "やりなおす", "N4"),
    ("言い直す", "いいなおす", "N4"),
    ("立て直す", "たてなおす", "N4"),
    ("組み立てる", "くみたてる", "N4"),
    ("解き放つ", "ときはなつ", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE18:
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
