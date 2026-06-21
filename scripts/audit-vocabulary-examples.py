# -*- coding: utf-8 -*-
"""Read-only audit of example-sentence coverage on published japanese_words.

NOTE on naming: the task spec suggested `scripts/audit-vocabulary-examples.ts`.
This project's vocab pipeline (fill-examples-*.py, examples-coverage-report.py)
is already wired to Supabase via urllib + .env.local, so the audit is implemented
in the same Python stack to reuse that architecture rather than duplicate it in TS.

Issues ONLY GET requests. Never writes. For each JLPT level N5..N1 it classifies
every published row and writes:
  reports/vocabulary-example-audit-summary.json
  reports/vocabulary-example-missing.csv
  reports/vocabulary-example-invalid.csv

Usage:
  python scripts/audit-vocabulary-examples.py            # all levels
  python scripts/audit-vocabulary-examples.py N5 N4      # subset
"""
import os, sys, json, csv, urllib.request, urllib.parse

HERE = os.path.dirname(__file__)
ENV_FILE = os.path.join(HERE, "..", ".env.local")
REPORTS = os.path.join(HERE, "..", "reports")

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

VALID_LEVELS = ["N5", "N4", "N3", "N2", "N1"]
LEVELS = [a.upper() for a in sys.argv[1:]] or VALID_LEVELS

# Markers of bad / placeholder / leaked-prefix content.
BAD_SUBSTRINGS = ("<", ">", "TODO", "todo", "translation", "example sentence",
                  "vn:", "vi:", "en:", "gb:", "ja:", "jp:")
JA_PUNCT = "。．！？!?…」』"


def hira_only(s):
    """True when every char is hiragana/katakana/long-mark (no kanji)."""
    return all("぀" <= c <= "ヿ" or c == "ー" for c in s) if s else False


def kanji_stem(w):
    """Drop trailing okurigana so conjugated forms still match (差し上げる->差し上)."""
    i = len(w)
    while i > 0 and "぀" <= w[i - 1] <= "ゟ":  # trailing hiragana
        i -= 1
    return w[:i]


def appears(word, reading, ja, ex_reading):
    ks = kanji_stem(word or "")
    return bool(
        (word and word in ja)
        or (ks and len(ks) >= 1 and ks in ja)
        or (reading and reading in (ex_reading or ""))
        or (reading and reading in ja)
    )


def first_meaning(meanings):
    if isinstance(meanings, list) and meanings and isinstance(meanings[0], dict):
        return meanings[0]
    return {}


def fetch_level(level):
    # Stable total order (id as unique tiebreaker) — without it, the thousands of
    # rows sharing frequency=0 make offset paging non-deterministic and rows get
    # returned on two pages, inflating counts. De-dupe by id as a second guard.
    seen, rows, offset, PAGE = set(), [], 0, 1000
    while True:
        url = (BASE + "?select=id,word,reading,jlpt_level,pos,meanings,examples,frequency"
               "&jlpt_level=eq." + level + "&is_published=eq.true"
               "&order=frequency.desc,id.asc&limit=" + str(PAGE) + "&offset=" + str(offset))
        page = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=H)).read())
        for r in page:
            if r["id"] not in seen:
                seen.add(r["id"]); rows.append(r)
        if len(page) < PAGE:
            break
        offset += PAGE
    return rows


def renderable_ja(examples):
    """First example object whose `ja` is usable, else None."""
    if not isinstance(examples, list):
        return None
    for e in examples:
        if isinstance(e, dict) and (e.get("ja") or "").strip():
            return e
    return None


# ── Audit ──
os.makedirs(REPORTS, exist_ok=True)
summary = {}
missing_rows, invalid_rows = [], []
ja_index = {}  # ja sentence -> list of (id, word) for global duplicate detection

all_data = {lv: fetch_level(lv) for lv in LEVELS}

# Pass 1: build global ja index for cross-record duplicate detection.
for lv, rows in all_data.items():
    for r in rows:
        ex = renderable_ja(r.get("examples"))
        if ex:
            ja_index.setdefault((ex.get("ja") or "").strip(), []).append((r["id"], r["word"]))

for lv in LEVELS:
    rows = all_data[lv]
    total = len(rows)
    valid = missing = invalid = 0
    no_vi = no_en = malformed = no_target = dup = bad_level = 0
    for r in rows:
        word, reading = r.get("word", ""), r.get("reading") or ""
        fm = first_meaning(r.get("meanings"))
        ex = renderable_ja(r.get("examples"))
        if r.get("jlpt_level") not in VALID_LEVELS:
            bad_level += 1
        if not ex:
            missing += 1
            missing_rows.append({
                "id": r["id"], "word": word, "reading": reading, "jlpt_level": r.get("jlpt_level"),
                "pos": "|".join(r.get("pos") or []), "vi": fm.get("vi", ""), "en": fm.get("en", ""),
                "examples": json.dumps(r.get("examples"), ensure_ascii=False),
                "reason": "no renderable ja example",
            })
            continue
        ja = (ex.get("ja") or "").strip()
        reasons = []
        if not any(p in ja for p in JA_PUNCT):
            reasons.append("no sentence punctuation")
        if any(b in ja.lower() for b in BAD_SUBSTRINGS):
            reasons.append("malformed/placeholder/prefix in ja"); malformed += 1
        if not appears(word, reading, ja, ex.get("reading")):
            reasons.append("target word/reading absent from sentence"); no_target += 1
        if not (ex.get("vi") or "").strip():
            reasons.append("ja but no vi translation"); no_vi += 1
        if not (ex.get("en") or "").strip():
            reasons.append("ja but no en translation"); no_en += 1
        owners = ja_index.get(ja, [])
        if len(owners) > 1:
            reasons.append("ja sentence duplicated across unrelated records"); dup += 1
        if reasons:
            invalid += 1
            invalid_rows.append({
                "id": r["id"], "word": word, "reading": reading, "jlpt_level": r.get("jlpt_level"),
                "pos": "|".join(r.get("pos") or []), "vi": fm.get("vi", ""), "en": fm.get("en", ""),
                "ja": ja, "ex_vi": ex.get("vi", ""), "ex_en": ex.get("en", ""),
                "reason": "; ".join(reasons),
            })
        else:
            valid += 1
    summary[lv] = {
        "total": total, "valid": valid, "missing": missing, "invalid": invalid,
        "details": {
            "ja_no_vi": no_vi, "ja_no_en": no_en, "malformed": malformed,
            "target_absent": no_target, "duplicate_ja": dup, "invalid_jlpt_level": bad_level,
        },
    }

# ALL aggregate
agg = {"total": 0, "valid": 0, "missing": 0, "invalid": 0,
       "details": {k: 0 for k in summary[LEVELS[0]]["details"]}}
for lv in LEVELS:
    for k in ("total", "valid", "missing", "invalid"):
        agg[k] += summary[lv][k]
    for k in agg["details"]:
        agg["details"][k] += summary[lv]["details"][k]
summary["ALL"] = agg

# ── Write reports ──
with open(os.path.join(REPORTS, "vocabulary-example-audit-summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

with open(os.path.join(REPORTS, "vocabulary-example-missing.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["id", "word", "reading", "jlpt_level", "pos", "vi", "en", "examples", "reason"])
    w.writeheader(); w.writerows(missing_rows)

with open(os.path.join(REPORTS, "vocabulary-example-invalid.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["id", "word", "reading", "jlpt_level", "pos", "vi", "en", "ja", "ex_vi", "ex_en", "reason"])
    w.writeheader(); w.writerows(invalid_rows)

# ── Terminal summary ──
print(f"{'Level':<6}{'total':>8}{'valid':>8}{'missing':>9}{'invalid':>9}")
for lv in LEVELS + ["ALL"]:
    s = summary[lv]
    print(f"{lv:<6}{s['total']:>8}{s['valid']:>8}{s['missing']:>9}{s['invalid']:>9}")
print("\nReports written to reports/ (summary.json, missing.csv, invalid.csv)")
print("Invalid breakdown (ALL):", json.dumps(summary["ALL"]["details"], ensure_ascii=False))
