# -*- coding: utf-8 -*-
"""Appends Wave 30 — common N3: excuse/life/ikebana/motivation/meeting."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE30 = [
    ("# ===== Wave 30: Memory / dark =====", None, None),
    ("暗記", "あんき", "N3"),
    ("暗黒", "あんこく", "N3"),
    ("# ===== Wave 30: Excuses / life / growth =====", None, None),
    ("言い訳", "いいわけ", "N3"),
    ("生き方", "いきかた", "N3"),
    ("育成", "いくせい", "N3"),
    ("# ===== Wave 30: Arts / intention / body =====", None, None),
    ("生け花", "いけばな", "N3"),
    ("意向", "いこう", "N3"),
    ("萎縮", "いしゅく", "N3"),
    ("痛々しい", "いたいたしい", "N3"),
    ("# ===== Wave 30: Drive / power / survival =====", None, None),
    ("意欲", "いよく", "N3"),
    ("威力", "いりょく", "N3"),
    ("命からがら", "いのちからがら", "N3"),
    ("# ===== Wave 30: Shadow / custom / culture =====", None, None),
    ("陰影", "いんえい", "N3"),
    ("因習", "いんしゅう", "N3"),
    ("入れ墨", "いれずみ", "N3"),
    ("# ===== Wave 30: Reception / meetings =====", None, None),
    ("受付", "うけつけ", "N3"),
    ("打ち明ける", "うちあける", "N3"),
    ("打ち合わせ", "うちあわせ", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE30:
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
