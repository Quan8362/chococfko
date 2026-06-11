# -*- coding: utf-8 -*-
"""Appends Wave 4 to jlpt-n3-vocab.csv — remnant/acid/mission/superior vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE4 = [
    ("# ===== Wave 4: Novel / Temporary =====", None, None),
    ("斬新", "ざんしん", "N3"),
    ("暫定", "ざんてい", "N3"),
    ("# ===== Wave 4: Cruelty / Remnant =====", None, None),
    ("残骸", "ざんがい", "N3"),
    ("残虐", "ざんぎゃく", "N3"),
    ("残酷", "ざんこく", "N3"),
    ("残留", "ざんりゅう", "N3"),
    ("残念ながら", "ざんねんながら", "N3"),
    ("# ===== Wave 4: Chemistry =====", None, None),
    ("酸素", "さんそ", "N3"),
    ("酸性", "さんせい", "N3"),
    ("酸性雨", "さんせいう", "N3"),
    ("# ===== Wave 4: Opinion / Praise =====", None, None),
    ("賛否両論", "さんぴりょうろん", "N3"),
    ("賛美", "さんび", "N3"),
    ("# ===== Wave 4: Work / Action =====", None, None),
    ("仕草", "しぐさ", "N3"),
    ("仕返し", "しかえし", "N3"),
    ("仕入れ", "しいれ", "N3"),
    ("使命", "しめい", "N3"),
    ("使節", "しせつ", "N3"),
    ("# ===== Wave 4: Upper / Superior =====", None, None),
    ("上等", "じょうとう", "N3"),
    ("上辺", "うわべ", "N3"),
    ("上役", "うわやく", "N3"),
    ("上流", "じょうりゅう", "N3"),
    ("上陸", "じょうりく", "N3"),
    ("上半身", "じょうはんしん", "N3"),
    ("# ===== Wave 4: Boarding / Movement =====", None, None),
    ("乗り気", "のりき", "N3"),
    ("乗り込む", "のりこむ", "N3"),
    ("乗り出す", "のりだす", "N3"),
    ("乗り越す", "のりこす", "N3"),
    ("乗り継ぐ", "のりつぐ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE4:
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
