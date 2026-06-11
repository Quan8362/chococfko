#!/usr/bin/env python3
"""
Generate a migration that gives japanese_kanji the COMPLETE modern JLPT
kanji set (N5 → N1) with metadata, so the writing workbook / kanji pages
have full coverage at every level.

Sources:
  - JLPT level (modern N5–N1): davidluzgouveia/kanji-data `kanji.json`
    field `jlpt_new` (5=N5 … 1=N1). 2,211 kanji total.
  - on/kun / stroke_count / English meanings: KANJIDIC2 (EDRDG, CC BY-SA).
  - han_viet + Vietnamese meaning: KanjiDictVN (trungnt2910, Từ điển Hán Nôm).

Stroke-order animation stays client-side (hanzi-writer / KanjiVG CDN).

SAFETY (japanese pipeline principles):
  - New migration file; does NOT touch the old seed migration.
  - Idempotent upsert. ON CONFLICT sets the authoritative jlpt_level +
    is_published, but only FILLS metadata (han_viet / readings / meanings /
    stroke_count) when the existing value is NULL — never overwrites curated rows.
  - Dry-run by default. Pass --write to emit the .sql file.

Usage:
  python scripts/build-kanji-jlpt.py            # dry-run: stats + samples
  python scripts/build-kanji-jlpt.py --write    # write the migration
"""
import gzip
import io
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

KANJI_DATA_URL = "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"
KANJIDIC_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"
KANJIDICTVN_URL = (
    "https://github.com/trungnt2910/KanjiDictVN/releases/download/"
    "trungnt2910.hannom.20251225-154650.kanjidic2.2025-345/KANJIDIC_vietnamese.zip"
)

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "supabase", "migration_japanese_kanji_jlpt.sql")
MAX_MEANINGS = 5


def fetch(url: str) -> bytes:
    print(f"  downloading {url.split('/')[-1]} ...", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "chococfko-kanji-jlpt/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def load_jlpt() -> dict:
    """Return {char: 'N5'..'N1'} for the modern JLPT kanji set."""
    data = json.loads(fetch(KANJI_DATA_URL))
    out = {}
    for ch, info in data.items():
        v = info.get("jlpt_new")
        if isinstance(v, int) and 1 <= v <= 5:
            out[ch] = f"N{v}"  # 5 -> N5 ... 1 -> N1
    print(f"  JLPT kanji: {len(out)}", file=sys.stderr)
    return out


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
    raw = fetch(KANJIDIC_URL)
    root = ET.fromstring(gzip.decompress(raw))
    out = {}
    for ch in root.findall("character"):
        literal = ch.findtext("literal")
        if not literal:
            continue
        misc = ch.find("misc")
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
        }
    print(f"  KANJIDIC2: {len(out)} chars", file=sys.stderr)
    return out


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql_text_array(items) -> str:
    if not items:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(sql_str(x) for x in items) + "]"


def main():
    write = "--write" in sys.argv
    jlpt = load_jlpt()
    kd = load_kanjidic()
    vn = load_kanjidictvn()

    by_level = {"N5": 0, "N4": 0, "N3": 0, "N2": 0, "N1": 0}
    n_hv = n_vi = n_meta = 0
    rows_sql = []
    # Stable order: by level (N5 first) then by stroke count then codepoint.
    level_rank = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}
    chars = sorted(jlpt.keys(), key=lambda c: (level_rank[jlpt[c]], (kd.get(c) or {}).get("stroke") or 99, c))

    for ch in chars:
        level = jlpt[ch]
        by_level[level] += 1
        k = kd.get(ch) or {"on": [], "kun": [], "en": [], "stroke": None}
        e = vn.get(ch, {})
        hv = e.get("hv") or ""
        vi = e.get("vi") or ""
        en = ", ".join(k["en"]).strip()
        if hv:
            n_hv += 1
        if vi:
            n_vi += 1
        if k["on"] or k["kun"] or en:
            n_meta += 1
        meanings_json = json.dumps([{"vi": vi, "en": en}], ensure_ascii=False)
        rows_sql.append(
            "(" + ", ".join([
                sql_str(ch),
                sql_text_array(k["on"]),
                sql_text_array(k["kun"]),
                sql_str(meanings_json) + "::jsonb",
                str(k["stroke"]) if k["stroke"] is not None else "NULL",
                sql_str(hv) if hv else "NULL",
                sql_str(level),
                "true",
            ]) + ")"
        )

    print(f"\nSummary: {len(rows_sql)} kanji", file=sys.stderr)
    print(f"  by level: {by_level}", file=sys.stderr)
    print(f"  with han_viet: {n_hv} | with vi meaning: {n_vi} | with on/kun/en: {n_meta}", file=sys.stderr)

    missing_meta = [c for c in chars if c not in kd]
    if missing_meta:
        print(f"  ⚠ {len(missing_meta)} kanji without KANJIDIC2 metadata: {''.join(missing_meta[:30])}", file=sys.stderr)

    if not write:
        for c in ("日", "学", "漢", "頼", "鬱"):
            if c in jlpt:
                k = kd.get(c, {})
                e = vn.get(c, {})
                line = f"  {c} [{jlpt[c]}]: on={k.get('on')} kun={k.get('kun')} stroke={k.get('stroke')} hv={e.get('hv')} vi={e.get('vi')!r}"
                sys.stdout.buffer.write((line + "\n").encode("utf-8"))
        print("\nDry-run only. Re-run with --write to emit the SQL file.", file=sys.stderr)
        return

    header = """-- AUTO-GENERATED by scripts/build-kanji-jlpt.py — do not edit by hand.
-- Complete modern JLPT kanji set (N5 → N1) for japanese_kanji.
-- Sources: kanji-data (jlpt_new) + KANJIDIC2 (EDRDG, CC BY-SA) + KanjiDictVN (Từ điển Hán Nôm).
--
-- Idempotent. ON CONFLICT sets the authoritative jlpt_level + is_published,
-- and only FILLS metadata where the existing column is NULL — curated rows
-- (han_viet / readings / meanings already set) are never overwritten.

alter table japanese_kanji add column if not exists han_viet text;

insert into japanese_kanji (character, onyomi, kunyomi, meanings, stroke_count, han_viet, jlpt_level, is_published)
values
"""
    footer = """
on conflict (character) do update set
  jlpt_level   = excluded.jlpt_level,
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
    print(f"\nWrote {abspath} ({len(out)} bytes, {len(rows_sql)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
