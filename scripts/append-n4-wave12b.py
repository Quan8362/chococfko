# -*- coding: utf-8 -*-
"""Appends Wave 12b N4 vocabulary to jlpt-n4-vocab.csv (supplemental)."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE12B = [
    ("# ===== Wave 12b: Compound Verbs =====", None, None),
    ("引き出す", "ひきだす", "N4"),
    ("引き止める", "ひきとめる", "N4"),
    ("言い訳する", "いいわけする", "N4"),
    ("言い張る", "いいはる", "N4"),
    ("呼び出す", "よびだす", "N4"),
    ("呼び止める", "よびとめる", "N4"),
    ("買い込む", "かいこむ", "N4"),
    ("売り出す", "うりだす", "N4"),
    ("持ち歩く", "もちあるく", "N4"),
    ("持ち込む", "もちこむ", "N4"),
    ("持ち出す", "もちだす", "N4"),
    ("歩き回る", "あるきまわる", "N4"),
    ("走り回る", "はしりまわる", "N4"),
    ("飛び出す", "とびだす", "N4"),
    ("飛び込む", "とびこむ", "N4"),
    ("飛び越える", "とびこえる", "N4"),
    ("# ===== Wave 12b: Katakana / Loanwords =====", None, None),
    ("アドバイス", "アドバイス", "N4"),
    ("アンケート", "アンケート", "N4"),
    ("エネルギー", "エネルギー", "N4"),
    ("カレンダー", "カレンダー", "N4"),
    ("コミュニケーション", "コミュニケーション", "N4"),
    ("サービス", "サービス", "N4"),
    ("スケジュール", "スケジュール", "N4"),
    ("ストレス", "ストレス", "N4"),
    ("テーマ", "テーマ", "N4"),
    ("ニュース", "ニュース", "N4"),
    ("パスポート", "パスポート", "N4"),
    ("ファイル", "ファイル", "N4"),
    ("ボランティア", "ボランティア", "N4"),
    ("マナー", "マナー", "N4"),
    ("ルール", "ルール", "N4"),
    ("レポート", "レポート", "N4"),
    ("# ===== Wave 12b: Emotions / Feelings =====", None, None),
    ("怒り", "いかり", "N4"),
    ("喜び", "よろこび", "N4"),
    ("悲しみ", "かなしみ", "N4"),
    ("苦しみ", "くるしみ", "N4"),
    ("楽しみ", "たのしみ", "N4"),
    ("驚き", "おどろき", "N4"),
    ("恥ずかしさ", "はずかしさ", "N4"),
    ("寂しさ", "さびしさ", "N4"),
    ("嬉しさ", "うれしさ", "N4"),
    ("# ===== Wave 12b: Time / Sequence =====", None, None),
    ("以前", "いぜん", "N4"),
    ("以後", "いご", "N4"),
    ("以来", "いらい", "N4"),
    ("当時", "とうじ", "N4"),
    ("現在", "げんざい", "N4"),
    ("将来", "しょうらい", "N4"),
    ("最近", "さいきん", "N4"),
    ("最初", "さいしょ", "N4"),
    ("最後", "さいご", "N4"),
    ("途中", "とちゅう", "N4"),
    ("# ===== Wave 12b: Degree / Manner Adverbs =====", None, None),
    ("ぜひ", "ぜひ", "N4"),
    ("きっと", "きっと", "N4"),
    ("たぶん", "たぶん", "N4"),
    ("もちろん", "もちろん", "N4"),
    ("なるべく", "なるべく", "N4"),
    ("できるだけ", "できるだけ", "N4"),
    ("急に", "きゅうに", "N4"),
    ("突然", "とつぜん", "N4"),
    ("すっかり", "すっかり", "N4"),
    ("だいぶ", "だいぶ", "N4"),
    ("# ===== Wave 12b: Family / Relationships =====", None, None),
    ("夫婦", "ふうふ", "N4"),
    ("兄弟", "きょうだい", "N4"),
    ("姉妹", "しまい", "N4"),
    ("親族", "しんぞく", "N4"),
    ("祖先", "そせん", "N4"),
    ("子孫", "しそん", "N4"),
    ("恋人", "こいびと", "N4"),
    ("友人", "ゆうじん", "N4"),
    ("知人", "ちじん", "N4"),
    ("隣人", "りんじん", "N4"),
    ("# ===== Wave 12b: Housing / Surroundings =====", None, None),
    ("廊下", "ろうか", "N4"),
    ("天井", "てんじょう", "N4"),
    ("床", "ゆか", "N4"),
    ("押し入れ", "おしいれ", "N4"),
    ("物置", "ものおき", "N4"),
    ("玄関", "げんかん", "N4"),
    ("庭", "にわ", "N4"),
    ("塀", "へい", "N4"),
    ("屋根", "やね", "N4"),
    ("壁", "かべ", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE12B:
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
