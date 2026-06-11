# -*- coding: utf-8 -*-
"""Appends Wave 7 — ichi/ika/medical/childcare/addition/family vocabulary."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE7 = [
    ("# ===== Wave 7: Once-in-a-lifetime / Consistent =====", None, None),
    ("一応", "いちおう", "N3"),
    ("一括", "いっかつ", "N3"),
    ("一貫", "いっかん", "N3"),
    ("一気に", "いっきに", "N3"),
    ("一挙両得", "いっきょりょうとく", "N3"),
    ("一期一会", "いちごいちえ", "N3"),
    ("# ===== Wave 7: Medical / Childcare =====", None, None),
    ("医療", "いりょう", "N3"),
    ("育児", "いくじ", "N3"),
    ("育て方", "そだてかた", "N3"),
    ("# ===== Wave 7: Addition / Join =====", None, None),
    ("加害", "かがい", "N3"),
    ("加減", "かげん", "N3"),
    ("加工", "かこう", "N3"),
    ("加速", "かそく", "N3"),
    ("加入", "かにゅう", "N3"),
    ("加盟", "かめい", "N3"),
    ("加齢", "かれい", "N3"),
    ("加筆", "かひつ", "N3"),
    ("# ===== Wave 7: Permissible / Lovely =====", None, None),
    ("可愛がる", "かわいがる", "N3"),
    ("可愛らしい", "かわいらしい", "N3"),
    ("可決", "かけつ", "N3"),
    ("可否", "かひ", "N3"),
    ("可憐", "かれん", "N3"),
    ("# ===== Wave 7: Household =====", None, None),
    ("家屋", "かおく", "N3"),
    ("家業", "かぎょう", "N3"),
    ("家計", "かけい", "N3"),
    ("家系", "かけい", "N3"),
    ("家財", "かざい", "N3"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE7:
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
