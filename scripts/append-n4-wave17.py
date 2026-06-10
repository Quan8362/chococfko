# -*- coding: utf-8 -*-
"""Appends Wave 17 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE17 = [
    ("# ===== Wave 17: Business / Work =====", None, None),
    ("会議室", "かいぎしつ", "N4"),
    ("取引先", "とりひきさき", "N4"),
    ("担当者", "たんとうしゃ", "N4"),
    ("部下", "ぶか", "N4"),
    ("上司", "じょうし", "N4"),
    ("同僚", "どうりょう", "N4"),
    ("就職活動", "しゅうしょくかつどう", "N4"),
    ("履歴書", "りれきしょ", "N4"),
    ("面接", "めんせつ", "N4"),
    ("採用", "さいよう", "N4"),
    ("昇進", "しょうしん", "N4"),
    ("退職", "たいしょく", "N4"),
    ("# ===== Wave 17: Financial / Economic =====", None, None),
    ("予算", "よさん", "N4"),
    ("費用", "ひよう", "N4"),
    ("支出", "ししゅつ", "N4"),
    ("収入", "しゅうにゅう", "N4"),
    ("利益", "りえき", "N4"),
    ("損失", "そんしつ", "N4"),
    ("投資", "とうし", "N4"),
    ("節約", "せつやく", "N4"),
    ("割引", "わりびき", "N4"),
    ("値上がり", "ねあがり", "N4"),
    ("値下がり", "ねさがり", "N4"),
    ("# ===== Wave 17: Health / Medical =====", None, None),
    ("診断", "しんだん", "N4"),
    ("治療", "ちりょう", "N4"),
    ("症状", "しょうじょう", "N4"),
    ("回復", "かいふく", "N4"),
    ("入院", "にゅういん", "N4"),
    ("退院", "たいいん", "N4"),
    ("手術", "しゅじゅつ", "N4"),
    ("処方箋", "しょほうせん", "N4"),
    ("アレルギー", "アレルギー", "N4"),
    ("# ===== Wave 17: Education / Study =====", None, None),
    ("教科書", "きょうかしょ", "N4"),
    ("参考書", "さんこうしょ", "N4"),
    ("試験範囲", "しけんはんい", "N4"),
    ("授業料", "じゅぎょうりょう", "N4"),
    ("奨学金", "しょうがくきん", "N4"),
    ("卒業論文", "そつぎょうろんぶん", "N4"),
    ("レポート", "レポート", "N4"),
    ("# ===== Wave 17: Nature / Environment =====", None, None),
    ("自然保護", "しぜんほご", "N4"),
    ("環境汚染", "かんきょうおせん", "N4"),
    ("地球温暖化", "ちきゅうおんだんか", "N4"),
    ("再生可能", "さいせいかのう", "N4"),
    ("太陽光", "たいようこう", "N4"),
    ("風力", "ふうりょく", "N4"),
    ("水力", "すいりょく", "N4"),
    ("原子力", "げんしりょく", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE17:
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
