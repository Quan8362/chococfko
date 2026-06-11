# -*- coding: utf-8 -*-
"""Appends Wave 35 — blunder/payment/deadline/collection/publisher/praise/soy sauce/invasion."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE35 = [
    ("# ===== Wave 35: Behavior / payment =====", None, None),
    ("失態", "しったい", "N3"),
    ("支払い", "しはらい", "N3"),
    ("渋々", "しぶしぶ", "N3"),
    ("締め切り", "しめきり", "N3"),
    ("# ===== Wave 35: Collection / learning =====", None, None),
    ("収集", "しゅうしゅう", "N3"),
    ("執着", "しゅうちゃく", "N3"),
    ("習得", "しゅうとく", "N3"),
    ("出版社", "しゅっぱんしゃ", "N3"),
    ("# ===== Wave 35: Praise / soy sauce / quantity =====", None, None),
    ("賞賛", "しょうさん", "N3"),
    ("醤油", "しょうゆ", "N3"),
    ("少量", "しょうりょう", "N3"),
    ("知り合い", "しりあい", "N3"),
    ("# ===== Wave 35: Invasion / situation =====", None, None),
    ("侵攻", "しんこう", "N3"),
    ("侵略", "しんりゃく", "N3"),
    ("事態", "じたい", "N3"),
    ("実情", "じつじょう", "N3"),
    ("# ===== Wave 35: Obedient / carpet / refreshing =====", None, None),
    ("従順", "じゅうじゅん", "N3"),
    ("絨毯", "じゅうたん", "N3"),
    ("純朴", "じゅんぼく", "N3"),
    ("清々しい", "すがすがしい", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE35:
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
