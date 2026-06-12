# -*- coding: utf-8 -*-
"""Appends Wave 42 — guarantee/praise/destroy/vast/advance/increasingly/pale/paralysis."""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"

WAVE42 = [
    ("# ===== Wave 42: Guarantee / conservative / praise =====", None, None),
    ("補佐", "ほさ", "N3"),
    ("保守的", "ほしゅてき", "N3"),
    ("保証", "ほしょう", "N3"),
    ("褒める", "ほめる", "N3"),
    ("# ===== Wave 42: Destroy / vast / in advance =====", None, None),
    ("滅びる", "ほろびる", "N3"),
    ("滅ぼす", "ほろぼす", "N3"),
    ("膨大", "ぼうだい", "N3"),
    ("前もって", "まえもって", "N3"),
    ("# ===== Wave 42: Increasingly / pale / paralysis / round =====", None, None),
    ("益々", "ますます", "N3"),
    ("真っ青", "まっさお", "N3"),
    ("麻痺", "まひ", "N3"),
    ("丸々", "まるまる", "N3"),
    ("# ===== Wave 42: Perfect score / appearance / minor =====", None, None),
    ("満点", "まんてん", "N3"),
    ("見かけ", "みかけ", "N3"),
    ("見かける", "みかける", "N3"),
    ("未成年", "みせいねん", "N3"),
    ("# ===== Wave 42: Gaze / estimate / regard / overlook =====", None, None),
    ("見つめる", "みつめる", "N3"),
    ("見積もり", "みつもり", "N3"),
    ("見なす", "みなす", "N3"),
    ("見逃す", "みのがす", "N3"),
    ("# ===== Wave 42: Visit / ethnic / decay / rather / alarm =====", None, None),
    ("見舞い", "みまい", "N3"),
    ("民族", "みんぞく", "N3"),
    ("虫歯", "むしば", "N3"),
    ("寧ろ", "むしろ", "N3"),
    ("目覚まし時計", "めざましどけい", "N3"),
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
