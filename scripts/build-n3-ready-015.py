# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-015.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 1708890 足取り, 2867035 家系, 2860958 既に (ghost)
# EXCLUDED: 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("題目","だいもく","N3","n",
        "tiêu đề | đề mục | chủ đề | đề tài",
        "title | heading | topic | subject | theme | Nichiren chant","1415500"),
    row("卓越","たくえつ","N3","n|vs|vi",
        "xuất sắc | vượt trội | ưu tú | siêu việt",
        "preeminence | excellence | superiority | transcendence","1415590"),
    row("卓球","たっきゅう","N3","n",
        "bóng bàn | ping-pong",
        "table tennis | ping-pong","1415610"),
    row("宅地","たくち","N3","n",
        "đất thổ cư | đất ở | lô đất xây dựng",
        "building lot | residential land","1415770"),
    row("宅配","たくはい","N3","n|vs|vt|adj-no",
        "giao hàng tận nhà",
        "home delivery","1415780"),
    row("宅配便","たくはいびん","N3","n",
        "dịch vụ giao hàng tận nhà | bưu kiện giao tận nhà",
        "express home delivery service | express home delivery parcel (box, etc.)","1415790"),
    row("択一","たくいつ","N3","n",
        "chọn một trong nhiều | trắc nghiệm một đáp án",
        "choosing one from among several | multiple choice","1415810"),
    row("沢庵","たくあん","N3","n",
        "dưa cải củ trắng | củ cải muối",
        "pickled daikon radish","1415860"),
    row("託児所","たくじしょ","N3","n",
        "nhà trẻ | nhà giữ trẻ",
        "creche | day nursery | day-care center","1415900"),
    row("濁流","だくりゅう","N3","n",
        "dòng nước đục | dòng chảy cuồn cuộn",
        "muddy stream","1415990"),
    row("凧揚げ","たこあげ","N3","n|vs",
        "thả diều",
        "kite flying","1416030"),
    row("但し","ただし","N3","conj",
        "nhưng | tuy nhiên | với điều kiện là",
        "but | however | provided that","1416190"),
    row("達する","たっする","N3","vs-s|vt",
        "đạt đến | tới | đến được",
        "to reach | to get to | to arrive at","1416230"),
    row("達人","たつじん","N3","n",
        "bậc thầy | chuyên gia | cao thủ",
        "master | expert","1416250"),
    row("奪回","だっかい","N3","n|vs|vt",
        "giành lại | khôi phục | chiếm lại",
        "recovery | rescue | recapture","1416350"),
    row("奪還","だっかん","N3","n|vs|vt",
        "giành lại | chiếm lại | thu hồi",
        "recapture | retaking | recovery | taking back","1416370"),
    row("奪取","だっしゅ","N3","n|vs|vt",
        "cướp đoạt | chiếm đoạt | giành lấy",
        "usurpation | taking back | dispossession","1416380"),
    row("脱却","だっきゃく","N3","n|vs|vt|vi",
        "thoát khỏi | vượt qua | từ bỏ | thoát ra",
        "ridding oneself | freeing oneself of | growing out of | overcoming | outgrowing","1416450"),
    row("脱臼","だっきゅう","N3","n|vs|vt|vi",
        "trật khớp | sai khớp",
        "dislocation","1416440"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
