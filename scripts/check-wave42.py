# -*- coding: utf-8 -*-
import csv

existing = set()
with open(r'C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv', encoding='utf-8') as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith('#'):
            existing.add(row[0].strip())

candidates = [
    '補佐','保守的','保証','褒める','滅びる','滅ぼす','膨大','前もって',
    '益々','真っ青','麻痺','丸々','満点','見かけ','見かける','未成年',
    '見つめる','見積もり','見なす','見逃す','見舞い','民族','虫歯','寧ろ','目覚まし時計'
]
for w in candidates:
    status = 'IN' if w in existing else 'NEW'
    print(status + ': ' + w)
print(f"\nTotal existing: {len(existing)}")
