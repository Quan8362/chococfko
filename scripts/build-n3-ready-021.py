# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-021.csv"
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
    row("旅先","たびさき","N3","n",
        "điểm đến | nơi dừng chân trong chuyến đi",
        "destination | place one stays during a trip","1553220"),
    row("旅程","りょてい","N3","n",
        "lịch trình | kế hoạch du lịch | hành trình",
        "itinerary | travel plans | distance (of a trip) | journey","1553240"),
    row("旅費","りょひ","N3","n",
        "chi phí đi lại | tiền đi đường",
        "travel expenses","1553250"),
    row("旅立ち","たびだち","N3","n|vs|vi",
        "khởi hành | lên đường | xuất phát",
        "setting off (on a trip) | departure","1553260"),
    row("了解","りょうかい","N3","n|vs|vt|int",
        "hiểu | đồng ý | OK | roger",
        "comprehension | consent | understanding | agreement | OK | roger","1553310"),
    row("両立","りょうりつ","N3","n|vs|vi",
        "tương thích | cùng tồn tại | dung hòa",
        "compatibility | coexistence | standing together","1554110"),
    row("療法","りょうほう","N3","n",
        "phương pháp điều trị | liệu pháp | cách chữa trị",
        "(method of) treatment | therapy | remedy | cure","1554470"),
    row("療養","りょうよう","N3","n|vs|vi",
        "dưỡng bệnh | điều dưỡng | an dưỡng",
        "recuperation | medical treatment","1554480"),
    row("良識","りょうしき","N3","n",
        "nhận thức đúng đắn | phán đoán tốt | lương tri",
        "good sense","1554570"),
    row("良質","りょうしつ","N3","adj-na|adj-no|n",
        "chất lượng tốt | cao cấp | ưu việt",
        "good quality | fine quality | superior quality | high quality","1554580"),
    row("良心","りょうしん","N3","n",
        "lương tâm",
        "conscience","1554590"),
    row("量産","りょうさん","N3","n|vs|vt",
        "sản xuất hàng loạt",
        "mass production","1554660"),
    row("領土","りょうど","N3","n",
        "lãnh thổ | lãnh địa",
        "territory | domain | dominion | possession","1554790"),
    row("倫理","りんり","N3","n",
        "đạo đức | luân lý | đạo đức học",
        "ethics | morals","1555390"),
    row("臨時","りんじ","N3","adj-no|n",
        "tạm thời | lâm thời | đặc biệt | bất thường",
        "temporary | provisional | interim | special | extraordinary | extra","1555610"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
