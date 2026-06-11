# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-025.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED (persistent 12): 1708890 足取り, 2867035 家系, 2860958 既に,
# 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい,
# 2844618 断行だんぎょう, 2120840 男女おとこおんな, 2828178 地質じしつ,
# 2834858 中流ちゅうる, 2772160 仲人なかびと

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("録音","ろくおん","N3","n|vs|vt",
        "thu âm | ghi âm | băng ghi âm",
        "(audio) recording","1561590"),
    row("録画","ろくが","N3","n|vs|vt",
        "ghi hình | thu hình | video ghi lại",
        "(video) recording","1561610"),
    row("論外","ろんがい","N3","adj-na|adj-no|n",
        "ngoài vấn đề | không thể chấp nhận | vô lý | không liên quan",
        "out of the question | outrageous | impossible | irrelevant | not pertinent","1561650"),
    row("和解","わかい","N3","n|vs|vi",
        "hòa giải | dàn xếp | thỏa thuận | hòa giải qua tòa án",
        "reconciliation | amicable settlement | accommodation | compromise | mediation | rapprochement","1562030"),
    row("和平","わへい","N3","n",
        "hòa bình",
        "peace","1562210"),
    row("話題","わだい","N3","n|adj-no",
        "chủ đề | chủ đề đang bàn | đang được chú ý | nóng hổi",
        "topic | subject | much talked about | topical | in the news | hot","1562400"),
    row("賄賂","わいろ","N3","n",
        "hối lộ | tiền đút lót",
        "bribe | sweetener | douceur","1562520"),
    row("腕時計","うでどけい","N3","n",
        "đồng hồ đeo tay",
        "wristwatch | watch","1562870"),
    row("腕前","うでまえ","N3","n",
        "kỹ năng | khả năng | năng lực",
        "ability | skill | facility","1562890"),
    row("湾岸","わんがん","N3","n",
        "bờ vịnh | ven vịnh",
        "gulf coast | bay coast","1562810"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
