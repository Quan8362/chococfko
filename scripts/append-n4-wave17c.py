# -*- coding: utf-8 -*-
"""Appends Wave 17c N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE17C = [
    ("# ===== Wave 17c: Suru Verbs - Social =====", None, None),
    ("協力する", "きょうりょくする", "N4"),
    ("協議する", "きょうぎする", "N4"),
    ("交渉する", "こうしょうする", "N4"),
    ("契約する", "けいやくする", "N4"),
    ("署名する", "しょめいする", "N4"),
    ("申告する", "しんこくする", "N4"),
    ("申請する", "しんせいする", "N4"),
    ("登録する", "とうろくする", "N4"),
    ("更新する", "こうしんする", "N4"),
    ("解約する", "かいやくする", "N4"),
    ("# ===== Wave 17c: Abstract Nouns =====", None, None),
    ("余裕", "よゆう", "N4"),
    ("余地", "よち", "N4"),
    ("余計", "よけい", "N4"),
    ("限界", "げんかい", "N4"),
    ("可能性", "かのうせい", "N4"),
    ("必要性", "ひつようせい", "N4"),
    ("重要性", "じゅうようせい", "N4"),
    ("有効性", "ゆうこうせい", "N4"),
    ("確実性", "かくじつせい", "N4"),
    ("# ===== Wave 17c: Time Expressions =====", None, None),
    ("以来", "いらい", "N4"),
    ("以降", "いこう", "N4"),
    ("以前", "いぜん", "N4"),
    ("従来", "じゅうらい", "N4"),
    ("将来", "しょうらい", "N4"),
    ("近頃", "ちかごろ", "N4"),
    ("頃合い", "ころあい", "N4"),
    ("当初", "とうしょ", "N4"),
    ("最終的", "さいしゅうてき", "N4"),
    ("# ===== Wave 17c: Describing Things =====", None, None),
    ("鮮やか", "あざやか", "N4"),
    ("穏やか", "おだやか", "N4"),
    ("滑らか", "なめらか", "N4"),
    ("細かい", "こまかい", "N4"),
    ("粗い", "あらい", "N4"),
    ("固い", "かたい", "N4"),
    ("柔らかい", "やわらかい", "N4"),
    ("軽い", "かるい", "N4"),
    ("重い", "おもい", "N4"),
    ("# ===== Wave 17c: Community / Society =====", None, None),
    ("町内会", "ちょうないかい", "N4"),
    ("自治会", "じちかい", "N4"),
    ("ボランティア", "ボランティア", "N4"),
    ("地域", "ちいき", "N4"),
    ("住民", "じゅうみん", "N4"),
    ("市民", "しみん", "N4"),
    ("国民", "こくみん", "N4"),
    ("移民", "いみん", "N4"),
    ("難民", "なんみん", "N4"),
    ("外国人", "がいこくじん", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE17C:
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
