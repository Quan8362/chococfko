# -*- coding: utf-8 -*-
"""Appends Wave 42 to jlpt-n4-vocab.csv.
Focus: emotion/mental state verbs, sound onomatopoeia, social interaction nouns.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE42 = [
    ("# ===== Wave 42: Emotion / Mental State Verbs =====", None, None),
    ("落ち込む", "おちこむ", "N4"),
    ("立ち直る", "たちなおる", "N4"),
    ("思い切る", "おもいきる", "N4"),
    ("気にする", "きにする", "N4"),
    ("悩む", "なやむ", "N4"),
    ("怒鳴る", "どなる", "N4"),
    ("慌てる", "あわてる", "N4"),
    ("# ===== Wave 42: Sound / Manner Onomatopoeia =====", None, None),
    ("ぼんやり", "ぼんやり", "N4"),
    ("きちんと", "きちんと", "N4"),
    ("はっきり", "はっきり", "N4"),
    ("すっきり", "すっきり", "N4"),
    ("どんどん", "どんどん", "N4"),
    ("のんびり", "のんびり", "N4"),
    ("ぴったり", "ぴったり", "N4"),
    ("くっきり", "くっきり", "N4"),
    ("# ===== Wave 42: Social Interaction Nouns =====", None, None),
    ("挨拶", "あいさつ", "N4"),
    ("お世話", "おせわ", "N4"),
    ("お礼", "おれい", "N4"),
    ("おわび", "おわび", "N4"),
    ("相談", "そうだん", "N4"),
    ("連絡", "れんらく", "N4"),
    ("報告", "ほうこく", "N4"),
    ("確認", "かくにん", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE42:
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
