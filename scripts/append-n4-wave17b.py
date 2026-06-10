# -*- coding: utf-8 -*-
"""Appends Wave 17b N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE17B = [
    ("# ===== Wave 17b: Compound Action Verbs =====", None, None),
    ("思い込む", "おもいこむ", "N4"),
    ("思い出す", "おもいだす", "N4"),
    ("思いつく", "おもいつく", "N4"),
    ("取り組む", "とりくむ", "N4"),
    ("取り上げる", "とりあげる", "N4"),
    ("取り替える", "とりかえる", "N4"),
    ("取り消す", "とりけす", "N4"),
    ("受け取る", "うけとる", "N4"),
    ("受け入れる", "うけいれる", "N4"),
    ("呼び出す", "よびだす", "N4"),
    ("引き受ける", "ひきうける", "N4"),
    ("引き返す", "ひきかえす", "N4"),
    ("# ===== Wave 17b: Movement / Direction =====", None, None),
    ("曲がり角", "まがりかど", "N4"),
    ("交差点", "こうさてん", "N4"),
    ("踏切", "ふみきり", "N4"),
    ("歩道橋", "ほどうきょう", "N4"),
    ("迂回路", "うかいろ", "N4"),
    ("近道", "ちかみち", "N4"),
    ("遠回り", "とおまわり", "N4"),
    ("一方通行", "いっぽうつうこう", "N4"),
    ("# ===== Wave 17b: Housing / Property =====", None, None),
    ("間取り", "まどり", "N4"),
    ("家賃", "やちん", "N4"),
    ("敷金", "しきん", "N4"),
    ("礼金", "れいきん", "N4"),
    ("管理費", "かんりひ", "N4"),
    ("引っ越し", "ひっこし", "N4"),
    ("リフォーム", "リフォーム", "N4"),
    ("駐車場", "ちゅうしゃじょう", "N4"),
    ("玄関", "げんかん", "N4"),
    ("廊下", "ろうか", "N4"),
    ("# ===== Wave 17b: Feelings / Emotions =====", None, None),
    ("後悔", "こうかい", "N4"),
    ("満足感", "まんぞくかん", "N4"),
    ("達成感", "たっせいかん", "N4"),
    ("孤独感", "こどくかん", "N4"),
    ("寂しさ", "さびしさ", "N4"),
    ("恥ずかしさ", "はずかしさ", "N4"),
    ("怒り", "いかり", "N4"),
    ("喜び", "よろこび", "N4"),
    ("悲しみ", "かなしみ", "N4"),
    ("# ===== Wave 17b: Food / Cooking =====", None, None),
    ("炒める", "いためる", "N4"),
    ("茹でる", "ゆでる", "N4"),
    ("蒸す", "むす", "N4"),
    ("揚げる", "あげる", "N4"),
    ("焼き上がる", "やきあがる", "N4"),
    ("味付け", "あじつけ", "N4"),
    ("塩加減", "しおかげん", "N4"),
    ("食材", "しょくざい", "N4"),
    ("調味料", "ちょうみりょう", "N4"),
    ("献立", "こんだて", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE17B:
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
