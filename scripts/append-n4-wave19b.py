# -*- coding: utf-8 -*-
"""Appends Wave 19b N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE19B = [
    ("# ===== Wave 19b: Transport / Travel =====", None, None),
    ("乗り換え", "のりかえ", "N4"),
    ("乗り継ぎ", "のりつぎ", "N4"),
    ("切符売り場", "きっぷうりば", "N4"),
    ("時刻表", "じこくひょう", "N4"),
    ("運賃", "うんちん", "N4"),
    ("定期券", "ていきけん", "N4"),
    ("回数券", "かいすうけん", "N4"),
    ("指定席", "していせき", "N4"),
    ("自由席", "じゆうせき", "N4"),
    ("グリーン車", "グリーンしゃ", "N4"),
    ("特急", "とっきゅう", "N4"),
    ("急行", "きゅうこう", "N4"),
    ("# ===== Wave 19b: Communication / Language =====", None, None),
    ("敬語", "けいご", "N4"),
    ("丁寧語", "ていねいご", "N4"),
    ("謙譲語", "けんじょうご", "N4"),
    ("尊敬語", "そんけいご", "N4"),
    ("方言", "ほうげん", "N4"),
    ("標準語", "ひょうじゅんご", "N4"),
    ("外来語", "がいらいご", "N4"),
    ("和語", "わご", "N4"),
    ("漢語", "かんご", "N4"),
    ("# ===== Wave 19b: Adjective-na (Personality) =====", None, None),
    ("温厚", "おんこう", "N4"),
    ("勤勉", "きんべん", "N4"),
    ("誠実", "せいじつ", "N4"),
    ("謙虚", "けんきょ", "N4"),
    ("慎重", "しんちょう", "N4"),
    ("大胆", "だいたん", "N4"),
    ("積極的", "せっきょくてき", "N4"),
    ("消極的", "しょうきょくてき", "N4"),
    ("# ===== Wave 19b: Specific Nouns =====", None, None),
    ("手がかり", "てがかり", "N4"),
    ("手続き", "てつづき", "N4"),
    ("手配", "てはい", "N4"),
    ("取り組み", "とりくみ", "N4"),
    ("仕組み", "しくみ", "N4"),
    ("枠組み", "わくぐみ", "N4"),
    ("試み", "こころみ", "N4"),
    ("試し", "ためし", "N4"),
    ("見込み", "みこみ", "N4"),
    ("見通し", "みとおし", "N4"),
    ("# ===== Wave 19b: Numbers / Math =====", None, None),
    ("整数", "せいすう", "N4"),
    ("小数", "しょうすう", "N4"),
    ("分数", "ぶんすう", "N4"),
    ("平方", "へいほう", "N4"),
    ("立方", "りっぽう", "N4"),
    ("円周", "えんしゅう", "N4"),
    ("半径", "はんけい", "N4"),
    ("直径", "ちょっけい", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE19B:
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
