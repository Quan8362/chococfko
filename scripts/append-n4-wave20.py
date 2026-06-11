# -*- coding: utf-8 -*-
"""Appends Wave 20 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE20 = [
    ("# ===== Wave 20: Shopping / Commerce =====", None, None),
    ("品質", "ひんしつ", "N4"),
    ("品揃え", "しなぞろえ", "N4"),
    ("売れ行き", "うれゆき", "N4"),
    ("在庫切れ", "ざいこぎれ", "N4"),
    ("取り寄せ", "とりよせ", "N4"),
    ("送料", "そうりょう", "N4"),
    ("代引き", "だいびき", "N4"),
    ("後払い", "あとばらい", "N4"),
    ("前払い", "まえばらい", "N4"),
    ("領収書", "りょうしゅうしょ", "N4"),
    ("# ===== Wave 20: Buildings / Rooms =====", None, None),
    ("物置", "ものおき", "N4"),
    ("倉庫", "そうこ", "N4"),
    ("屋根裏", "やねうら", "N4"),
    ("地下室", "ちかしつ", "N4"),
    ("応接間", "おうせつま", "N4"),
    ("仏間", "ぶつま", "N4"),
    ("洋室", "ようしつ", "N4"),
    ("和室", "わしつ", "N4"),
    ("押し入れ", "おしいれ", "N4"),
    ("# ===== Wave 20: Compound Verbs with 出す =====", None, None),
    ("取り出す", "とりだす", "N4"),
    ("飛び出す", "とびだす", "N4"),
    ("逃げ出す", "にげだす", "N4"),
    ("転び出す", "ころびだす", "N4"),
    ("走り出す", "はしりだす", "N4"),
    ("叫び出す", "さけびだす", "N4"),
    ("歌い出す", "うたいだす", "N4"),
    ("泣き出す", "なきだす", "N4"),
    ("笑い出す", "わらいだす", "N4"),
    ("# ===== Wave 20: Formal / Written Language =====", None, None),
    ("申し訳", "もうしわけ", "N4"),
    ("ご連絡", "ごれんらく", "N4"),
    ("ご確認", "ごかくにん", "N4"),
    ("ご利用", "ごりよう", "N4"),
    ("ご案内", "ごあんない", "N4"),
    ("ご返事", "ごへんじ", "N4"),
    ("ご記入", "ごきにゅう", "N4"),
    ("ご不明", "ごふめい", "N4"),
    ("ご協力", "ごきょうりょく", "N4"),
    ("# ===== Wave 20: Plants / Nature =====", None, None),
    ("芽吹く", "めぶく", "N4"),
    ("しおれる", "しおれる", "N4"),
    ("枯らす", "からす", "N4"),
    ("根付く", "ねつく", "N4"),
    ("実る", "みのる", "N4"),
    ("散る", "ちる", "N4"),
    ("芽", "め", "N4"),
    ("幹", "みき", "N4"),
    ("枝", "えだ", "N4"),
    ("根", "ね", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE20:
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
