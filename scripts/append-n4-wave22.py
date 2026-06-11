# -*- coding: utf-8 -*-
"""Appends Wave 22 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE22 = [
    ("# ===== Wave 22: Verbs of Communication =====", None, None),
    ("言い聞かせる", "いいきかせる", "N4"),
    ("言い張る", "いいはる", "N4"),
    ("言い渡す", "いいわたす", "N4"),
    ("問い合わせる", "といあわせる", "N4"),
    ("問い返す", "といかえす", "N4"),
    ("呼びかける", "よびかける", "N4"),
    ("話しかける", "はなしかける", "N4"),
    ("打ち明ける", "うちあける", "N4"),
    ("打ち合わせる", "うちあわせる", "N4"),
    ("語りかける", "かたりかける", "N4"),
    ("# ===== Wave 22: Numbers / Counting =====", None, None),
    ("一桁", "ひとけた", "N4"),
    ("二桁", "ふたけた", "N4"),
    ("億", "おく", "N4"),
    ("兆", "ちょう", "N4"),
    ("奇数", "きすう", "N4"),
    ("偶数", "ぐうすう", "N4"),
    ("倍数", "ばいすう", "N4"),
    ("公倍数", "こうばいすう", "N4"),
    ("公約数", "こうやくすう", "N4"),
    ("# ===== Wave 22: Abstract Actions =====", None, None),
    ("打ち消す", "うちけす", "N4"),
    ("打ち壊す", "うちこわす", "N4"),
    ("切り離す", "きりはなす", "N4"),
    ("切り捨てる", "きりすてる", "N4"),
    ("切り替える", "きりかえる", "N4"),
    ("切り開く", "きりひらく", "N4"),
    ("切り抜ける", "きりぬける", "N4"),
    ("飛び越える", "とびこえる", "N4"),
    ("飛びつく", "とびつく", "N4"),
    ("# ===== Wave 22: Colour / Appearance =====", None, None),
    ("鮮明", "せんめい", "N4"),
    ("不透明", "ふとうめい", "N4"),
    ("透明", "とうめい", "N4"),
    ("半透明", "はんとうめい", "N4"),
    ("光沢", "こうたく", "N4"),
    ("艶", "つや", "N4"),
    ("色合い", "いろあい", "N4"),
    ("色味", "いろみ", "N4"),
    ("色調", "しきちょう", "N4"),
    ("# ===== Wave 22: Finance (detail) =====", None, None),
    ("手数料", "てすうりょう", "N4"),
    ("消費税", "しょうひぜい", "N4"),
    ("源泉徴収", "げんせんちょうしゅう", "N4"),
    ("確定申告", "かくていしんこく", "N4"),
    ("年末調整", "ねんまつちょうせい", "N4"),
    ("給与明細", "きゅうよめいさい", "N4"),
    ("口座番号", "こうざばんごう", "N4"),
    ("振込先", "ふりこみさき", "N4"),
    ("引き落とし", "ひきおとし", "N4"),
    ("繰り越し", "くりこし", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE22:
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
