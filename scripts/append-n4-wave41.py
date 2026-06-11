# -*- coding: utf-8 -*-
"""Appends Wave 41 to jlpt-n4-vocab.csv.
Focus: abstract nouns, compound verbs, na-adjectives, time expressions.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE41 = [
    ("# ===== Wave 41: Abstract Nouns =====", None, None),
    ("素直", "すなお", "N4"),
    ("誠実", "せいじつ", "N4"),
    ("謙虚", "けんきょ", "N4"),
    ("丁寧", "ていねい", "N4"),
    ("真剣", "しんけん", "N4"),
    ("真面目", "まじめ", "N4"),
    ("器用", "きよう", "N4"),
    ("不器用", "ぶきよう", "N4"),
    ("几帳面", "きちょうめん", "N4"),
    ("# ===== Wave 41: Compound Verbs =====", None, None),
    ("思い出す", "おもいだす", "N4"),
    ("取り消す", "とりけす", "N4"),
    ("申し込む", "もうしこむ", "N4"),
    ("呼び出す", "よびだす", "N4"),
    ("書き直す", "かきなおす", "N4"),
    ("読み返す", "よみかえす", "N4"),
    ("受け取る", "うけとる", "N4"),
    ("引き受ける", "ひきうける", "N4"),
    ("# ===== Wave 41: Time Expressions =====", None, None),
    ("以前", "いぜん", "N4"),
    ("以後", "いご", "N4"),
    ("ただ今", "ただいま", "N4"),
    ("当時", "とうじ", "N4"),
    ("現在", "げんざい", "N4"),
    ("将来", "しょうらい", "N4"),
    ("近頃", "ちかごろ", "N4"),
    ("# ===== Wave 41: Na-adjectives (character/manner) =====", None, None),
    ("滑らか", "なめらか", "N4"),
    ("穏やか", "おだやか", "N4"),
    ("豊か", "ゆたか", "N4"),
    ("賑やか", "にぎやか", "N4"),
    ("静か", "しずか", "N4"),
    ("複雑", "ふくざつ", "N4"),
    ("簡単", "かんたん", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE41:
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
