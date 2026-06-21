# -*- coding: utf-8 -*-
"""Expand short 8-char id prefixes in a hand-authored wave file to full UUIDs,
looking them up in a worklist file (which carries full ids). Rewrites in place.

Usage:
  python scripts/expand-wave-ids.py <wave.json> <worklist.json>
"""
import sys, json

wave_path, work_path = sys.argv[1], sys.argv[2]
work = json.load(open(work_path, encoding="utf-8"))
prefix_map = {}
for w in work:
    prefix_map.setdefault(w["id"][:8], []).append(w["id"])

wave = json.load(open(wave_path, encoding="utf-8"))
fixed = ambiguous = already = 0
for e in wave:
    wid = e["id"]
    if len(wid) >= 36:
        already += 1; continue
    cands = prefix_map.get(wid, [])
    if len(cands) == 1:
        e["id"] = cands[0]; fixed += 1
    else:
        print(f"  ! cannot resolve prefix {wid} ({e.get('word')}): {len(cands)} matches")
        ambiguous += 1

if ambiguous:
    print(f"ABORT: {ambiguous} unresolved prefixes — not writing.")
    sys.exit(1)

json.dump(wave, open(wave_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{wave_path}: expanded {fixed}, already-full {already}")
