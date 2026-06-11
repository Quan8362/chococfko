# -*- coding: utf-8 -*-
"""Appends Wave 31 to jlpt-n4-vocab.csv.
Focus: survival/action verbs, social/cultural terms, writing/text.
"""
import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE31 = [
    ("# ===== Wave 31: Action / Survival Verbs =====", None, None),
    ("生き残る", "いきのこる", "N4"),
    ("助かる", "たすかる", "N4"),
    ("逃げ出す", "にげだす", "N4"),
    ("追いかける", "おいかける", "N4"),
    ("追い越す", "おいこす", "N4"),
    ("飛び込む", "とびこむ", "N4"),
    ("飛び出す", "とびだす", "N4"),
    ("切り替える", "きりかえる", "N4"),
    ("溶け込む", "とけこむ", "N4"),
    ("# ===== Wave 31: Social / Etiquette =====", None, None),
    ("敬語", "けいご", "N4"),
    ("丁寧語", "ていねいご", "N4"),
    ("敬意", "けいい", "N4"),
    ("礼節", "れいせつ", "N4"),
    ("お辞儀", "おじぎ", "N4"),
    ("しきたり", "しきたり", "N4"),
    ("風習", "ふうしゅう", "N4"),
    ("# ===== Wave 31: Writing / Text =====", None, None),
    ("段落", "だんらく", "N4"),
    ("見出し", "みだし", "N4"),
    ("目次", "もくじ", "N4"),
    ("索引", "さくいん", "N4"),
    ("注釈", "ちゅうしゃく", "N4"),
    ("下書き", "したがき", "N4"),
    ("清書", "せいしょ", "N4"),
    ("# ===== Wave 31: Time Expressions =====", None, None),
    ("一昨年", "おととし", "N4"),
    ("一昨日", "おととい", "N4"),
    ("今頃", "いまごろ", "N4"),
    ("年度", "ねんど", "N4"),
    ("月末", "つきすえ", "N4"),
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
