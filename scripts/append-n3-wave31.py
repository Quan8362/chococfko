# -*- coding: utf-8 -*-
"""Appends Wave 31 — business/evidence/wisdom/origami/memory."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE31 = [
    ("# ===== Wave 31: Commerce / evidence =====", None, None),
    ("埋め合わせる", "うめあわせる", "N3"),
    ("裏付け", "うらづけ", "N3"),
    ("売り上げ", "うりあげ", "N3"),
    ("運送", "うんそう", "N3"),
    ("# ===== Wave 31: Talent / wisdom / support =====", None, None),
    ("英才", "えいさい", "N3"),
    ("英知", "えいち", "N3"),
    ("援護", "えんご", "N3"),
    ("追い風", "おいかぜ", "N3"),
    ("# ===== Wave 31: Conduct / expression =====", None, None),
    ("大げさ", "おおげさ", "N3"),
    ("憶測", "おくそく", "N3"),
    ("行い", "おこない", "N3"),
    ("# ===== Wave 31: Memory / culture =====", None, None),
    ("思いつく", "おもいつく", "N3"),
    ("思い出", "おもいで", "N3"),
    ("折り紙", "おりがみ", "N3"),
    ("恩義", "おんぎ", "N3"),
    ("# ===== Wave 31: Fire / fragrance / connection =====", None, None),
    ("火炎", "かえん", "N3"),
    ("香り", "かおり", "N3"),
    ("関わり", "かかわり", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE31:
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
