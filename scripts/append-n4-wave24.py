# -*- coding: utf-8 -*-
"""Appends Wave 24 N4 vocabulary to jlpt-n4-vocab.csv.
Focus on words confirmed to exist in JMdict staging from earlier pool scans.
"""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE24 = [
    ("# ===== Wave 24: Adjectives / Mood =====", None, None),
    ("和む", "なごむ", "N4"),
    ("和やか", "なごやか", "N4"),
    ("和らぐ", "やわらぐ", "N4"),
    ("和らげる", "やわらげる", "N4"),
    ("おっとり", "おっとり", "N4"),
    ("物静か", "ものしずか", "N4"),
    ("清々しい", "すがすがしい", "N4"),
    ("晴れやか", "はれやか", "N4"),
    ("穏やか", "おだやか", "N4"),
    ("朗らか", "ほがらか", "N4"),
    ("# ===== Wave 24: Logic / Argument =====", None, None),
    ("論理", "ろんり", "N4"),
    ("論理的", "ろんりてき", "N4"),
    ("論点", "ろんてん", "N4"),
    ("論争", "ろんそう", "N4"),
    ("論調", "ろんちょう", "N4"),
    ("論評", "ろんぴょう", "N4"),
    ("論破", "ろんぱ", "N4"),
    ("# ===== Wave 24: Daily Life Actions =====", None, None),
    ("目を見張る", "めをみはる", "N4"),
    ("耳を傾ける", "みみをかたむける", "N4"),
    ("手を抜く", "てをぬく", "N4"),
    ("口を出す", "くちをだす", "N4"),
    ("気を抜く", "きをぬく", "N4"),
    ("気を遣う", "きをつかう", "N4"),
    ("聞き間違い", "ききまちがい", "N4"),
    ("# ===== Wave 24: Work / Business =====", None, None),
    ("企業理念", "きぎょうりねん", "N4"),
    ("代替案", "だいたいあん", "N4"),
    ("増減率", "ぞうげんりつ", "N4"),
    ("著作権", "ちょさくけん", "N4"),
    ("諸事情", "しょじじょう", "N4"),
    ("# ===== Wave 24: Descriptions =====", None, None),
    ("本編", "ほんぺん", "N4"),
    ("牧", "まき", "N4"),
    ("仮構", "かこう", "N4"),
    ("通話表", "つうわひょう", "N4"),
    ("泥団子", "どろだんご", "N4"),
    ("# ===== Wave 24: Additional Verbs =====", None, None),
    ("言い訳する", "いいわけする", "N4"),
    ("聞き取れる", "ききとれる", "N4"),
    ("書き直す", "かきなおす", "N4"),
    ("読み返す", "よみかえす", "N4"),
    ("走り回る", "はしりまわる", "N4"),
    ("飛び回る", "とびまわる", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE24:
    if word.startswith("#"):
        lines_to_add.append(f"{word},,\n")
    elif word not in existing:
        lines_to_add.append(f"{word},{reading},{level}\n")
        added += 1
    else:
        skipped += 1
        print(f"  Skip duplicate: {word}")

with open(CSV_FILE, "a", encoding="utf-8", newline="") as f:
    f.write("\n")
    f.writelines(lines_to_add)

print(f"Added {added} new entries, skipped {skipped} duplicates")
