# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-039.csv -- 7 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-039.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id,
        ex_jp="", ex_rd="", ex_vi="", ex_en=""):
    return ",".join([
        q(word), q(reading), q(""), q(lvl), q(pos),
        q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"),
        q(ex_jp), q(ex_rd), q(ex_vi), q(ex_en),
        q("ai_draft"), q("jmdict_ai"),
    ])

ROWS = [
    row("自慢","じまん","N4","n|vs|vt",
        "tự hào | sự khoe khoang | khoe mẽ | tự mãn",
        "pride (in one's achievements, possessions, etc.) | self-praise | boasting | bragging",
        "1318680",
        "子供を自慢する。","こどもをじまんする。",
        "Khoe về con cái.","Brag about one's children."),
    row("失望","しつぼう","N4","n|vs|vi",
        "thất vọng | vỡ mộng | tuyệt vọng",
        "disappointment | despair",
        "1320170",
        "結果に失望する。","けっかにしつぼうする。",
        "Thất vọng với kết quả.","Be disappointed with the result."),
    row("孤独","こどく","N4","adj-na|n",
        "cô đơn | sự cô độc | cô lập | một mình",
        "solitude | loneliness | isolation",
        "1266850",
        "孤独を感じる。","こどくをかんじる。",
        "Cảm thấy cô đơn.","Feel lonely."),
    row("憧れる","あこがれる","N4","v1|vi",
        "ao ước | khao khát | ngưỡng mộ | mơ tới",
        "to long for | to yearn for | to hanker after | to be attracted by | to admire",
        "1453810",
        "パリに憧れる。","ぱりにあこがれる。",
        "Ao ước được đến Paris.","Yearn for Paris."),
    row("我慢","がまん","N4","n|vs|vt",
        "chịu đựng | kiên nhẫn | nhẫn nại | nén lòng | chịu đựng (cơn đau, khó chịu)",
        "endurance | patience | perseverance | bearing (with something) | putting up with | self-control",
        "1196970",
        "痛みを我慢する。","いたみをがまんする。",
        "Chịu đựng cơn đau.","Endure the pain."),
    row("緊張","きんちょう","N4","n|vs|vi",
        "căng thẳng | hồi hộp | lo lắng | tình trạng căng thẳng",
        "tension | strain | nervousness | stress | tensions (between countries, etc.)",
        "1241880",
        "発表の前に緊張する。","はっぴょうのまえにきんちょうする。",
        "Hồi hộp trước buổi thuyết trình.","Feel nervous before a presentation."),
    row("落ち込む","おちこむ","N4","v5m|vi",
        "chán nản | buồn bã | suy sụp | xuống tinh thần | sa vào (hố)",
        "to feel down | to feel sad | to be depressed | to be in low spirits | to fall into (a hole, ditch, etc.) | to cave in | to collapse",
        "1548570",
        "失敗して落ち込む。","しっぱいしておちこむ。",
        "Chán nản vì thất bại.","Feel depressed after failing."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
