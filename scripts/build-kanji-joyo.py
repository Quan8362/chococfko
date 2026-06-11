#!/usr/bin/env python3
"""
Generate a migration that adds the full Jōyō kanji set (常用漢字, the official
2,136 regular-use kanji) to japanese_kanji as a SEPARATE classification, using
the official school-grade structure:

  joyo_grade 1..6 = Kyōiku kanji taught in elementary grades 1–6
  joyo_grade 7    = remaining Jōyō kanji (taught in secondary school; KANJIDIC2 grade 8)

This is independent of jlpt_level — a kanji can have both (e.g. 日 = N5 + grade 1).

Sources:
  - Jōyō grade: KANJIDIC2 <misc><grade> (1–6 = Kyōiku, 8 = secondary Jōyō).
  - on/kun / stroke_count / English meanings: KANJIDIC2 (EDRDG, CC BY-SA).
  - han_viet + Vietnamese meaning: KanjiDictVN (trungnt2910, Từ điển Hán Nôm).

SAFETY (japanese pipeline principles):
  - New migration file; does NOT touch older migrations.
  - Idempotent upsert. ON CONFLICT sets joyo_grade + is_published, NEVER touches
    jlpt_level, and only FILLS metadata when the existing value is NULL.
  - Dry-run by default. Pass --write to emit the .sql file.

Usage:
  python scripts/build-kanji-joyo.py            # dry-run: stats + samples
  python scripts/build-kanji-joyo.py --write    # write the migration
"""
import gzip
import io
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

KANJIDIC_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"
KANJIDICTVN_URL = (
    "https://github.com/trungnt2910/KanjiDictVN/releases/download/"
    "trungnt2910.hannom.20251225-154650.kanjidic2.2025-345/KANJIDIC_vietnamese.zip"
)

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "supabase", "migration_japanese_kanji_joyo.sql")
MAX_MEANINGS = 5


def fetch(url: str) -> bytes:
    print(f"  downloading {url.split('/')[-1]} ...", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "chococfko-kanji-joyo/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def load_kanjidictvn() -> dict:
    raw = fetch(KANJIDICTVN_URL)
    out = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        for name in z.namelist():
            if not name.startswith("kanji_bank"):
                continue
            for e in json.loads(z.read(name).decode("utf-8")):
                ch = e[0]
                hv = (e[1] or "").strip()
                meanings = e[4] or []
                vi = "; ".join(m.strip() for m in meanings[:MAX_MEANINGS] if m.strip())
                out[ch] = {
                    "hv": " ".join(dict.fromkeys(hv.split())).upper() if hv else "",
                    "vi": " ".join(vi.split()),
                }
    print(f"  KanjiDictVN: {len(out)} chars", file=sys.stderr)
    return out


def load_kanjidic() -> dict:
    """Return {char: {on, kun, en, stroke, grade}} for kanji that have a grade."""
    raw = fetch(KANJIDIC_URL)
    root = ET.fromstring(gzip.decompress(raw))
    out = {}
    for ch in root.findall("character"):
        literal = ch.findtext("literal")
        if not literal:
            continue
        misc = ch.find("misc")
        grade = misc.findtext("grade") if misc is not None else None
        stroke = misc.findtext("stroke_count") if misc is not None else None
        on, kun, en = [], [], []
        rm = ch.find("reading_meaning")
        if rm is not None:
            grp = rm.find("rmgroup")
            if grp is not None:
                for rd in grp.findall("reading"):
                    if rd.get("r_type") == "ja_on" and rd.text:
                        on.append(rd.text)
                    elif rd.get("r_type") == "ja_kun" and rd.text:
                        kun.append(rd.text)
                for mn in grp.findall("meaning"):
                    if mn.get("m_lang") is None and mn.text:
                        en.append(mn.text)
        out[literal] = {
            "on": on,
            "kun": kun,
            "en": en[:MAX_MEANINGS],
            "stroke": int(stroke) if stroke and stroke.isdigit() else None,
            "grade": int(grade) if grade and grade.isdigit() else None,
        }
    return out


def joyo_grade(kanjidic_grade):
    """Map KANJIDIC2 grade -> our joyo_grade (1..7). None if not Jōyō."""
    if kanjidic_grade in (1, 2, 3, 4, 5, 6):
        return kanjidic_grade
    if kanjidic_grade == 8:  # remaining Jōyō (secondary school)
        return 7
    return None  # 9,10 = Jinmeiyō (not Jōyō)


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql_text_array(items) -> str:
    if not items:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(sql_str(x) for x in items) + "]"


def main():
    write = "--write" in sys.argv
    kd = load_kanjidic()
    vn = load_kanjidictvn()

    chars = [c for c, k in kd.items() if joyo_grade(k["grade"]) is not None]
    chars.sort(key=lambda c: (joyo_grade(kd[c]["grade"]), kd[c]["stroke"] or 99, c))

    by_grade = {g: 0 for g in range(1, 8)}
    n_hv = n_vi = 0
    rows_sql = []
    for ch in chars:
        k = kd[ch]
        g = joyo_grade(k["grade"])
        by_grade[g] += 1
        e = vn.get(ch, {})
        hv = e.get("hv") or ""
        vi = e.get("vi") or ""
        en = ", ".join(k["en"]).strip()
        if hv:
            n_hv += 1
        if vi:
            n_vi += 1
        meanings_json = json.dumps([{"vi": vi, "en": en}], ensure_ascii=False)
        rows_sql.append(
            "(" + ", ".join([
                sql_str(ch),
                sql_text_array(k["on"]),
                sql_text_array(k["kun"]),
                sql_str(meanings_json) + "::jsonb",
                str(k["stroke"]) if k["stroke"] is not None else "NULL",
                sql_str(hv) if hv else "NULL",
                str(g),
                "true",
            ]) + ")"
        )

    total = len(rows_sql)
    print(f"\nSummary: {total} Jōyō kanji", file=sys.stderr)
    print(f"  by grade (1-6 = elementary, 7 = secondary): {by_grade}", file=sys.stderr)
    print(f"  with han_viet: {n_hv} | with vi meaning: {n_vi}", file=sys.stderr)

    if not write:
        for c in ("日", "学", "校", "議", "鬱"):
            if c in kd and joyo_grade(kd[c]["grade"]) is not None:
                k = kd[c]
                e = vn.get(c, {})
                line = f"  {c} [grade {joyo_grade(k['grade'])}]: on={k['on']} kun={k['kun']} stroke={k['stroke']} hv={e.get('hv')}"
                sys.stdout.buffer.write((line + "\n").encode("utf-8"))
        print("\nDry-run only. Re-run with --write to emit the SQL file.", file=sys.stderr)
        return

    header = """-- AUTO-GENERATED by scripts/build-kanji-joyo.py — do not edit by hand.
-- Full Jōyō kanji set (常用漢字, 2,136) classified by official school grade:
--   joyo_grade 1..6 = Kyōiku (elementary grades 1–6), 7 = secondary-school Jōyō.
-- Independent of jlpt_level. Sources: KANJIDIC2 (EDRDG, CC BY-SA) + KanjiDictVN.
--
-- Idempotent. ON CONFLICT sets joyo_grade + is_published, never touches
-- jlpt_level, and only FILLS metadata where the existing column is NULL.

alter table japanese_kanji add column if not exists han_viet text;
alter table japanese_kanji add column if not exists joyo_grade smallint;
create index if not exists idx_japanese_kanji_joyo_grade on japanese_kanji (joyo_grade) where joyo_grade is not null;

insert into japanese_kanji (character, onyomi, kunyomi, meanings, stroke_count, han_viet, joyo_grade, is_published)
values
"""
    footer = """
on conflict (character) do update set
  joyo_grade   = excluded.joyo_grade,
  is_published = true,
  han_viet     = coalesce(japanese_kanji.han_viet, excluded.han_viet),
  stroke_count = coalesce(japanese_kanji.stroke_count, excluded.stroke_count),
  onyomi       = case when japanese_kanji.onyomi is null or cardinality(japanese_kanji.onyomi) = 0
                      then excluded.onyomi else japanese_kanji.onyomi end,
  kunyomi      = case when japanese_kanji.kunyomi is null or cardinality(japanese_kanji.kunyomi) = 0
                      then excluded.kunyomi else japanese_kanji.kunyomi end,
  meanings     = coalesce(japanese_kanji.meanings, excluded.meanings);
"""
    out = header + ",\n".join(rows_sql) + footer
    abspath = os.path.abspath(OUT_PATH)
    with open(abspath, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"\nWrote {abspath} ({len(out)} bytes, {total} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
