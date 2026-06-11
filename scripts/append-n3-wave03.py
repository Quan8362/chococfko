# -*- coding: utf-8 -*-
"""Appends Wave 3 to jlpt-n3-vocab.csv — drama/decision/industry/result vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE3 = [
    ("# ===== Wave 3: Theatre / Drama =====", None, None),
    ("劇場", "げきじょう", "N3"),
    ("劇的", "げきてき", "N3"),
    ("芸術家", "げいじゅつか", "N3"),
    ("芸能人", "げいのうじん", "N3"),
    ("# ===== Wave 3: Intensity / Emotion =====", None, None),
    ("激励", "げきれい", "N3"),
    ("激増", "げきぞう", "N3"),
    ("激減", "げきげん", "N3"),
    ("激怒", "げきど", "N3"),
    ("激情", "げきじょう", "N3"),
    ("# ===== Wave 3: Absence / Deficiency =====", None, None),
    ("欠席", "けっせき", "N3"),
    ("欠点", "けってん", "N3"),
    ("欠如", "けつじょ", "N3"),
    ("欠乏", "けつぼう", "N3"),
    ("# ===== Wave 3: Decision / Determination =====", None, None),
    ("決意", "けつい", "N3"),
    ("決心", "けっしん", "N3"),
    ("決断", "けつだん", "N3"),
    ("決定", "けってい", "N3"),
    ("決定的", "けっていてき", "N3"),
    ("# ===== Wave 3: Result / Unity =====", None, None),
    ("結構", "けっこう", "N3"),
    ("結束", "けっそく", "N3"),
    ("結末", "けつまつ", "N3"),
    ("結晶", "けっしょう", "N3"),
    ("# ===== Wave 3: Character / Purity =====", None, None),
    ("潔白", "けっぱく", "N3"),
    ("# ===== Wave 3: Industry / Product =====", None, None),
    ("産業", "さんぎょう", "N3"),
    ("産地", "さんち", "N3"),
    ("産物", "さんぶつ", "N3"),
    ("産休", "さんきゅう", "N3"),
    ("# ===== Wave 3: Nature / Other =====", None, None),
    ("散策", "さんさく", "N3"),
    ("散文", "さんぶん", "N3"),
    ("珊瑚", "さんご", "N3"),
    ("山脈", "さんみゃく", "N3"),
    ("隙間", "すきま", "N3"),
    ("惨め", "みじめ", "N3"),
    ("賛同", "さんどう", "N3"),
    ("血液型", "けつえきがた", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE3:
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
