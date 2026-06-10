# -*- coding: utf-8 -*-
"""Appends Wave 14 N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE14 = [
    ("# ===== Wave 14: Verbs — Perception / Interaction =====", None, None),
    ("見かける", "みかける", "N4"),
    ("見守る", "みまもる", "N4"),
    ("見合わせる", "みあわせる", "N4"),
    ("持ち上げる", "もちあげる", "N4"),
    ("話しかける", "はなしかける", "N4"),
    ("問いかける", "といかける", "N4"),
    ("向き合う", "むきあう", "N4"),
    ("感じ取る", "かんじとる", "N4"),
    ("気にかける", "きにかける", "N4"),
    ("考え込む", "かんがえこむ", "N4"),
    ("落ち着かせる", "おちつかせる", "N4"),
    ("働きかける", "はたらきかける", "N4"),
    ("寄り道する", "よりみちする", "N4"),
    ("手渡す", "てわたす", "N4"),
    ("声をかける", "こえをかける", "N4"),
    ("# ===== Wave 14: I-adjectives / Expressions =====", None, None),
    ("惜しい", "おしい", "N4"),
    ("うらやましい", "うらやましい", "N4"),
    ("申し訳ない", "もうしわけない", "N4"),
    ("もったいない", "もったいない", "N4"),
    ("情けない", "なさけない", "N4"),
    ("ふさわしい", "ふさわしい", "N4"),
    ("まぶしい", "まぶしい", "N4"),
    ("臭い", "くさい", "N4"),
    ("眠い", "ねむい", "N4"),
    ("痒い", "かゆい", "N4"),
    ("鋭い", "するどい", "N4"),
    ("鈍い", "にぶい", "N4"),
    ("# ===== Wave 14: Admin / Document Nouns =====", None, None),
    ("文書", "ぶんしょ", "N4"),
    ("資料", "しりょう", "N4"),
    ("報告書", "ほうこくしょ", "N4"),
    ("計画書", "けいかくしょ", "N4"),
    ("申請書", "しんせいしょ", "N4"),
    ("問い合わせ", "といあわせ", "N4"),
    ("申し込み", "もうしこみ", "N4"),
    ("取り組み", "とりくみ", "N4"),
    ("取り扱い", "とりあつかい", "N4"),
    ("受け付け", "うけつけ", "N4"),
    ("引き渡し", "ひきわたし", "N4"),
    ("# ===== Wave 14: Quantities / Counters =====", None, None),
    ("何十", "なんじゅう", "N4"),
    ("何百", "なんびゃく", "N4"),
    ("何千", "なんぜん", "N4"),
    ("何万", "なんまん", "N4"),
    ("何割", "なんわり", "N4"),
    ("数十", "すうじゅう", "N4"),
    ("数百", "すうひゃく", "N4"),
    ("数千", "すうせん", "N4"),
    ("# ===== Wave 14: Comparison / Degree =====", None, None),
    ("同様", "どうよう", "N4"),
    ("同等", "どうとう", "N4"),
    ("比べて", "くらべて", "N4"),
    ("に比べ", "にくらべ", "N4"),
    ("相対的", "そうたいてき", "N4"),
    ("絶対的", "ぜったいてき", "N4"),
    ("# ===== Wave 14: Medical / Health =====", None, None),
    ("症状", "しょうじょう", "N4"),
    ("副作用", "ふくさよう", "N4"),
    ("手術", "しゅじゅつ", "N4"),
    ("入院", "にゅういん", "N4"),
    ("退院", "たいいん", "N4"),
    ("通院", "つういん", "N4"),
    ("診察", "しんさつ", "N4"),
    ("注射", "ちゅうしゃ", "N4"),
    ("包帯", "ほうたい", "N4"),
    ("体力", "たいりょく", "N4"),
    ("# ===== Wave 14: Art / Culture =====", None, None),
    ("芸術", "げいじゅつ", "N4"),
    ("芸能", "げいのう", "N4"),
    ("演技", "えんぎ", "N4"),
    ("演奏", "えんそう", "N4"),
    ("作曲", "さっきょく", "N4"),
    ("作詞", "さくし", "N4"),
    ("撮影", "さつえい", "N4"),
    ("展覧会", "てんらんかい", "N4"),
    ("絵画", "かいが", "N4"),
    ("彫刻", "ちょうこく", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE14:
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
