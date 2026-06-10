# -*- coding: utf-8 -*-
"""Appends Wave 16b N4 vocabulary to jlpt-n4-vocab.csv."""

import csv

CSV_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n4-vocab.csv"

WAVE16B = [
    ("# ===== Wave 16b: Science / Nature Verbs =====", None, None),
    ("蒸発する", "じょうはつする", "N4"),
    ("凝固する", "ぎょうこする", "N4"),
    ("溶解する", "ようかいする", "N4"),
    ("分解する", "ぶんかいする", "N4"),
    ("合成する", "ごうせいする", "N4"),
    ("変化する", "へんかする", "N4"),
    ("成長する", "せいちょうする", "N4"),
    ("発展する", "はってんする", "N4"),
    ("繁殖する", "はんしょくする", "N4"),
    ("絶滅する", "ぜつめつする", "N4"),
    ("# ===== Wave 16b: Technology / Computer =====", None, None),
    ("データ", "データ", "N4"),
    ("システム", "システム", "N4"),
    ("プログラム", "プログラム", "N4"),
    ("ソフトウェア", "ソフトウェア", "N4"),
    ("ハードウェア", "ハードウェア", "N4"),
    ("インターネット", "インターネット", "N4"),
    ("ウェブサイト", "ウェブサイト", "N4"),
    ("アプリ", "アプリ", "N4"),
    ("クラウド", "クラウド", "N4"),
    ("バックアップ", "バックアップ", "N4"),
    ("ダウンロード", "ダウンロード", "N4"),
    ("アップロード", "アップロード", "N4"),
    ("# ===== Wave 16b: Architecture / City =====", None, None),
    ("建築", "けんちく", "N4"),
    ("構造", "こうぞう", "N4"),
    ("設計", "せっけい", "N4"),
    ("工事", "こうじ", "N4"),
    ("改修", "かいしゅう", "N4"),
    ("解体", "かいたい", "N4"),
    ("施設", "しせつ", "N4"),
    ("設備", "せつび", "N4"),
    ("インフラ", "インフラ", "N4"),
    ("# ===== Wave 16b: Personality Adjectives =====", None, None),
    ("几帳面", "きちょうめん", "N4"),
    ("いい加減", "いいかげん", "N4"),
    ("気まぐれ", "きまぐれ", "N4"),
    ("気さく", "きさく", "N4"),
    ("おおらか", "おおらか", "N4"),
    ("神経質", "しんけいしつ", "N4"),
    ("無口", "むくち", "N4"),
    ("おしゃべり", "おしゃべり", "N4"),
    ("# ===== Wave 16b: Time / Schedule =====", None, None),
    ("予定", "よてい", "N4"),
    ("スケジュール", "スケジュール", "N4"),
    ("期限", "きげん", "N4"),
    ("締め切り", "しめきり", "N4"),
    ("期間", "きかん", "N4"),
    ("年度", "ねんど", "N4"),
    ("四半期", "しはんき", "N4"),
    ("上半期", "かみはんき", "N4"),
    ("下半期", "しもはんき", "N4"),
    ("# ===== Wave 16b: Verbs of Giving / Receiving =====", None, None),
    ("差し上げる", "さしあげる", "N4"),
    ("いただく", "いただく", "N4"),
    ("くださる", "くださる", "N4"),
    ("あげる", "あげる", "N4"),
    ("もらう", "もらう", "N4"),
    ("頂戴する", "ちょうだいする", "N4"),
    ("贈る", "おくる", "N4"),
    ("寄付する", "きふする", "N4"),
    ("捧げる", "ささげる", "N4"),
]

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

added = 0
skipped = 0
lines_to_add = []
for word, reading, level in WAVE16B:
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
