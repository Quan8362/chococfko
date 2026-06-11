# -*- coding: utf-8 -*-
import csv, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
CSV_FILE  = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\source\jlpt-n3-vocab.csv"
CAND_FILE = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\scripts\n3-candidates-7.txt"

existing = set()
with open(CSV_FILE, encoding="utf-8", newline="") as f:
    for row in csv.reader(f):
        if row and row[0] and not row[0].startswith("#"):
            existing.add(row[0].strip())

fresh = []
with open(CAND_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("Total"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        word    = parts[0].strip()
        reading = parts[1].strip()
        seq     = parts[2].strip()
        meaning = parts[3].strip() if len(parts) > 3 else ""
        if word not in existing:
            try:
                seq_int = int(seq)
            except ValueError:
                continue
            fresh.append((seq_int, word, reading, meaning))

fresh.sort(key=lambda x: x[0])
print(f"Fresh candidates total: {len(fresh)}")
print()
print("=== ent_seq 1588400-1600000 ===")
subset = [(s, w, r, m) for s, w, r, m in fresh if 1588400 <= s < 1600000]
print(f"Count: {len(subset)}")
for seq, word, reading, meaning in subset[:130]:
    try:
        print(f"  {seq}\t{word}\t[{reading}]\t{meaning[:70]}")
    except Exception:
        print(f"  {seq}")
