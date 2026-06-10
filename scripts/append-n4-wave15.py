# -*- coding: utf-8 -*-
"""Appends Wave 15 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE15 = [
    ("# ===== Wave 15: Intransitive/Transitive Verb Pairs =====", None, None),
    ("繰り返す", "くりかえす", "N4"),
    ("残す", "のこす", "N4"),
    ("残る", "のこる", "N4"),
    ("伸ばす", "のばす", "N4"),
    ("伸びる", "のびる", "N4"),
    ("縮む", "ちぢむ", "N4"),
    ("広げる", "ひろげる", "N4"),
    ("広がる", "ひろがる", "N4"),
    ("高める", "たかめる", "N4"),
    ("高まる", "たかまる", "N4"),
    ("下げる", "さげる", "N4"),
    ("下がる", "さがる", "N4"),
    ("済む", "すむ", "N4"),
    ("済ます", "すます", "N4"),
    ("込む", "こむ", "N4"),
    ("# ===== Wave 15: Emotional / Psychological Nouns =====", None, None),
    ("後悔", "こうかい", "N4"),
    ("感激", "かんげき", "N4"),
    ("動揺", "どうよう", "N4"),
    ("焦り", "あせり", "N4"),
    ("苛立ち", "いらだち", "N4"),
    ("戸惑い", "とまどい", "N4"),
    ("葛藤", "かっとう", "N4"),
    ("前向き", "まえむき", "N4"),
    ("後ろ向き", "うしろむき", "N4"),
    ("# ===== Wave 15: Academic Subjects =====", None, None),
    ("生物学", "せいぶつがく", "N4"),
    ("化学", "かがく", "N4"),
    ("物理", "ぶつり", "N4"),
    ("天文学", "てんもんがく", "N4"),
    ("哲学", "てつがく", "N4"),
    ("心理学", "しんりがく", "N4"),
    ("経済学", "けいざいがく", "N4"),
    ("社会学", "しゃかいがく", "N4"),
    ("# ===== Wave 15: Body (Organs) =====", None, None),
    ("腸", "ちょう", "N4"),
    ("胃", "い", "N4"),
    ("肺", "はい", "N4"),
    ("肝臓", "かんぞう", "N4"),
    ("腎臓", "じんぞう", "N4"),
    ("血管", "けっかん", "N4"),
    ("関節", "かんせつ", "N4"),
    ("骨格", "こっかく", "N4"),
    ("# ===== Wave 15: Legal / International =====", None, None),
    ("条約", "じょうやく", "N4"),
    ("協定", "きょうてい", "N4"),
    ("合意", "ごうい", "N4"),
    ("条件", "じょうけん", "N4"),
    ("署名", "しょめい", "N4"),
    ("認証", "にんしょう", "N4"),
    ("締結", "ていけつ", "N4"),
    ("# ===== Wave 15: Communication / Digital =====", None, None),
    ("返信", "へんしん", "N4"),
    ("連絡先", "れんらくさき", "N4"),
    ("通知", "つうち", "N4"),
    ("手順", "てじゅん", "N4"),
    ("使い方", "つかいかた", "N4"),
    ("説明書", "せつめいしょ", "N4"),
    ("取扱説明書", "とりあつかいせつめいしょ", "N4"),
    ("# ===== Wave 15: Physical States / Actions =====", None, None),
    ("燃える", "もえる", "N4"),
    ("燃やす", "もやす", "N4"),
    ("凍る", "こおる", "N4"),
    ("凍らせる", "こおらせる", "N4"),
    ("沸く", "わく", "N4"),
    ("沸かす", "わかす", "N4"),
    ("炊く", "たく", "N4"),
    ("刻む", "きざむ", "N4"),
    ("剥く", "むく", "N4"),
    ("砕く", "くだく", "N4"),
    ("潰す", "つぶす", "N4"),
    ("潰れる", "つぶれる", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE15:
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
