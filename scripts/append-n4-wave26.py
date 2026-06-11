# -*- coding: utf-8 -*-
"""Appends Wave 26 to jlpt-n4-vocab.csv.
Focus: emotions, feelings, social interactions.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE26 = [
    ("# ===== Wave 26: Emotions & Feelings =====", None, None),
    ("緊張", "きんちょう", "N4"),
    ("孤独", "こどく", "N4"),
    ("我慢", "がまん", "N4"),
    ("遠慮", "えんりょ", "N4"),
    ("不安", "ふあん", "N4"),
    ("期待", "きたい", "N4"),
    ("失望", "しつぼう", "N4"),
    ("満足", "まんぞく", "N4"),
    ("後悔", "こうかい", "N4"),
    ("感謝", "かんしゃ", "N4"),
    ("ため息", "ためいき", "N4"),
    ("涙", "なみだ", "N4"),
    ("笑顔", "えがお", "N4"),
    ("表情", "ひょうじょう", "N4"),
    ("態度", "たいど", "N4"),
    ("# ===== Wave 26: Emotional Adjectives =====", None, None),
    ("羨ましい", "うらやましい", "N4"),
    ("懐かしい", "なつかしい", "N4"),
    ("恥ずかしい", "はずかしい", "N4"),
    ("悔しい", "くやしい", "N4"),
    ("寂しい", "さびしい", "N4"),
    ("怪しい", "あやしい", "N4"),
    ("眩しい", "まぶしい", "N4"),
    ("頼もしい", "たのもしい", "N4"),
    ("もったいない", "もったいない", "N4"),
    ("# ===== Wave 26: Emotional Verbs =====", None, None),
    ("憧れる", "あこがれる", "N4"),
    ("喜ぶ", "よろこぶ", "N4"),
    ("怒る", "おこる", "N4"),
    ("落ち込む", "おちこむ", "N4"),
    ("感動する", "かんどうする", "N4"),
    ("悩む", "なやむ", "N4"),
    ("励ます", "はげます", "N4"),
    ("慰める", "なぐさめる", "N4"),
    ("# ===== Wave 26: Social Interaction =====", None, None),
    ("褒める", "ほめる", "N4"),
    ("叱る", "しかる", "N4"),
    ("謝る", "あやまる", "N4"),
    ("断る", "ことわる", "N4"),
    ("自慢", "じまん", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE26:
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
