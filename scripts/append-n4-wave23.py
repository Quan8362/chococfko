# -*- coding: utf-8 -*-
"""Appends Wave 23 N4 vocabulary to jlpt-n4-vocab.csv (JMdict-friendly words)."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE23 = [
    ("# ===== Wave 23: Occupation / Roles =====", None, None),
    ("消防士", "しょうぼうし", "N4"),
    ("警察官", "けいさつかん", "N4"),
    ("弁護士", "べんごし", "N4"),
    ("検察官", "けんさつかん", "N4"),
    ("税理士", "ぜいりし", "N4"),
    ("建築士", "けんちくし", "N4"),
    ("薬剤師", "やくざいし", "N4"),
    ("栄養士", "えいようし", "N4"),
    ("作業療法士", "さぎょうりょうほうし", "N4"),
    ("理学療法士", "りがくりょうほうし", "N4"),
    ("# ===== Wave 23: Events / Activities =====", None, None),
    ("運動会", "うんどうかい", "N4"),
    ("文化祭", "ぶんかさい", "N4"),
    ("学芸会", "がくげいかい", "N4"),
    ("体育祭", "たいいくさい", "N4"),
    ("卒業式", "そつぎょうしき", "N4"),
    ("入学式", "にゅうがくしき", "N4"),
    ("始業式", "しぎょうしき", "N4"),
    ("終業式", "しゅうぎょうしき", "N4"),
    ("展覧会", "てんらんかい", "N4"),
    ("# ===== Wave 23: Verbs with 込む =====", None, None),
    ("持ち込む", "もちこむ", "N4"),
    ("飛び込む", "とびこむ", "N4"),
    ("割り込む", "わりこむ", "N4"),
    ("滑り込む", "すべりこむ", "N4"),
    ("押し込む", "おしこむ", "N4"),
    ("詰め込む", "つめこむ", "N4"),
    ("叩き込む", "たたきこむ", "N4"),
    ("吹き込む", "ふきこむ", "N4"),
    ("刷り込む", "すりこむ", "N4"),
    ("# ===== Wave 23: Clothing / Fashion =====", None, None),
    ("着替え", "きがえ", "N4"),
    ("着付け", "きつけ", "N4"),
    ("試着", "しちゃく", "N4"),
    ("縫い目", "ぬいめ", "N4"),
    ("裾", "すそ", "N4"),
    ("袖", "そで", "N4"),
    ("衿", "えり", "N4"),
    ("帯", "おび", "N4"),
    ("履物", "はきもの", "N4"),
    ("下駄", "げた", "N4"),
    ("# ===== Wave 23: Nature Actions =====", None, None),
    ("芽生える", "めばえる", "N4"),
    ("咲き乱れる", "さきみだれる", "N4"),
    ("落ち葉", "おちば", "N4"),
    ("新芽", "しんめ", "N4"),
    ("蕾", "つぼみ", "N4"),
    ("花弁", "かべん", "N4"),
    ("雌しべ", "めしべ", "N4"),
    ("雄しべ", "おしべ", "N4"),
    ("受粉", "じゅふん", "N4"),
    ("光合成", "こうごうせい", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE23:
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
