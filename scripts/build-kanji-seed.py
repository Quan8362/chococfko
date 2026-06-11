#!/usr/bin/env python3
"""
Generate a SQL migration that backfills japanese_kanji with factual metadata:

  KANJIDIC2 (EDRDG, CC BY-SA):
    - onyomi (ja_on) / kunyomi (ja_kun) / stroke_count / English meanings
  KanjiDictVN (trungnt2910, from Từ điển Hán Nôm + KANJIDIC):
    - han_viet  (Sino-Vietnamese reading, e.g. 頼 → LẠI)
    - Vietnamese meaning

Stroke-order animation is handled client-side by hanzi-writer (KanjiVG CDN),
so this only fills the text metadata shown next to each Kanji.

SAFETY (japanese pipeline principles):
  - Never overwrites curated rows. ON CONFLICT only fills han_viet when NULL.
  - New rows: jlpt_level = NULL (KANJIDIC2 uses the old JLPT system; we don't
    guess the modern N5–N1 mapping). is_published = true.
  - Dry-run by default. Pass --write to emit the .sql file.

Usage:
  python scripts/build-kanji-seed.py            # dry-run: stats + samples
  python scripts/build-kanji-seed.py --write    # write supabase/migration_japanese_kanji_seed.sql
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

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "supabase", "migration_japanese_kanji_seed.sql")
MAX_MEANINGS = 5


def fetch(url: str) -> bytes:
    print(f"  downloading {url.split('/')[-1]} ...", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "chococfko-kanji-seed/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def load_kanjidictvn() -> dict:
    """Return {char: {'hv': 'LẠI', 'vi': 'meaning; meaning'}} from KanjiDictVN."""
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


def load_kanjidic() -> list:
    raw = fetch(KANJIDIC_URL)
    root = ET.fromstring(gzip.decompress(raw))
    rows = []
    for ch in root.findall("character"):
        literal = ch.findtext("literal")
        if not literal:
            continue
        misc = ch.find("misc")
        grade = misc.findtext("grade") if misc is not None else None
        freq = misc.findtext("freq") if misc is not None else None
        jlpt = misc.findtext("jlpt") if misc is not None else None
        stroke = misc.findtext("stroke_count") if misc is not None else None

        # Keep only the "useful" set: jouyou/jinmeiyou OR frequency-ranked OR old-JLPT.
        if not (grade or freq or jlpt):
            continue

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

        rows.append({
            "char": literal,
            "on": on,
            "kun": kun,
            "en": en[:MAX_MEANINGS],
            "stroke": int(stroke) if stroke and stroke.isdigit() else None,
        })
    print(f"  KANJIDIC2 usable kanji: {len(rows)}", file=sys.stderr)
    return rows


def sql_str(s: str) -> str:
    # PostgreSQL standard string literals (standard_conforming_strings = on,
    # Supabase default) treat backslash as a literal char — only single quotes
    # need doubling. JSON escapes like \" must pass through untouched.
    return "'" + s.replace("'", "''") + "'"


def sql_text_array(items) -> str:
    if not items:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(sql_str(x) for x in items) + "]"


def main():
    write = "--write" in sys.argv
    vn = load_kanjidictvn()
    kanji = load_kanjidic()

    rows_sql = []
    n_hv = n_vi = 0
    for k in kanji:
        ch = k["char"]
        extra = vn.get(ch, {})
        hv = extra.get("hv") or ""
        vi = extra.get("vi") or ""
        if hv:
            n_hv += 1
        if vi:
            n_vi += 1
        meanings_json = json.dumps([{"vi": vi, "en": ", ".join(k["en"]).strip()}], ensure_ascii=False)
        rows_sql.append(
            "(" + ", ".join([
                sql_str(ch),
                sql_text_array(k["on"]),
                sql_text_array(k["kun"]),
                sql_str(meanings_json) + "::jsonb",
                str(k["stroke"]) if k["stroke"] is not None else "NULL",
                sql_str(hv) if hv else "NULL",
                "NULL",   # jlpt_level
                "true",   # is_published
            ]) + ")"
        )

    print(f"\nSummary: {len(rows_sql)} rows | han_viet: {n_hv} | vi_meaning: {n_vi}", file=sys.stderr)

    if not write:
        for c in ("頼", "学", "生", "強", "勉", "静"):
            k = next((x for x in kanji if x["char"] == c), None)
            e = vn.get(c, {})
            if k:
                line = f"  {c}: on={k['on']} kun={k['kun']} stroke={k['stroke']} hv={e.get('hv')} vi={e.get('vi')!r}"
                sys.stdout.buffer.write((line + "\n").encode("utf-8"))
        print("\nDry-run only. Re-run with --write to emit the SQL file.", file=sys.stderr)
        return

    header = """-- AUTO-GENERATED by scripts/build-kanji-seed.py — do not edit by hand.
-- Sources: KANJIDIC2 (EDRDG, CC BY-SA) + KanjiDictVN (trungnt2910, Từ điển Hán Nôm).
-- Backfills japanese_kanji with on/kun/meanings/stroke_count/han_viet.
-- Stroke-order animation is client-side (hanzi-writer / KanjiVG), not stored here.
--
-- Safe to re-run: ON CONFLICT never overwrites curated rows; it only fills
-- han_viet when it is currently NULL.

alter table japanese_kanji add column if not exists han_viet text;

insert into japanese_kanji (character, onyomi, kunyomi, meanings, stroke_count, han_viet, jlpt_level, is_published)
values
"""
    footer = """
on conflict (character) do update
  set han_viet = coalesce(japanese_kanji.han_viet, excluded.han_viet);
"""
    out = header + ",\n".join(rows_sql) + footer
    abspath = os.path.abspath(OUT_PATH)
    with open(abspath, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"\nWrote {abspath} ({len(out)} bytes, {len(rows_sql)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
