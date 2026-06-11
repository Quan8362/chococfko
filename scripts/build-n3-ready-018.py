# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-018.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED (persistent ghosts/variants + new): 1708890 足取り, 2867035 家系, 2860958 既に,
# 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい,
# 2844618 断行だんぎょう, 2120840 男女おとこおんな, 2828178 地質じしつ (fabric quality)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("地球","ちきゅう","N3","n",
        "Trái Đất | địa cầu",
        "Earth | the globe","1420970"),
    row("地球規模","ちきゅうきぼ","N3","n|adj-no",
        "quy mô toàn cầu",
        "global scale","1420990"),
    row("地殻","ちかく","N3","n",
        "vỏ Trái Đất | lớp vỏ địa cầu",
        "(Earth's) crust","1420940"),
    row("地すべり","じすべり","N3","n",
        "lở đất | trượt đất",
        "landslide | landslip","1420960"),
    row("地区","ちく","N3","n",
        "khu vực | quận | vùng | địa khu",
        "district | area | zone | quarter | section | region","1421020"),
    row("地元","じもと","N3","n|adj-no",
        "địa phương | khu vực quê nhà | người địa phương",
        "home area | home town | local","1421060"),
    row("地質","ちしつ","N3","n",
        "địa chất | đặc điểm địa tầng",
        "geological features","1421130"),
    row("地主","じぬし","N3","n",
        "địa chủ | chủ đất",
        "landowner | landlord | landlady","1421150"),
    row("地上","ちじょう","N3","n|adj-no",
        "trên mặt đất | trên cạn | thế gian",
        "above ground | on the ground | earth's surface | this world | this earth","1421180"),
    row("地帯","ちたい","N3","n",
        "vùng | khu vực | vành đai | địa đới",
        "zone | area | belt | region","1421360"),
    row("地点","ちてん","N3","n",
        "địa điểm | vị trí | điểm",
        "spot | point | place | position","1421380"),
    row("地道","じみち","N3","adj-na|n",
        "kiên trì | chắc chắn | thực tế | đáng tin cậy",
        "steady | honest | sober | straightforward | reliable","1421400"),
    row("地名","ちめい","N3","n",
        "địa danh | tên địa lý",
        "place name | toponym","1421500"),
    row("地面","じめん","N3","n",
        "mặt đất | bề mặt đất | đất đai",
        "ground | earth's surface | land | lot | plot","1421510"),
    row("地理","ちり","N3","n",
        "địa lý",
        "geography","1421540"),
    row("恥","はじ","N3","n",
        "xấu hổ | sự hổ thẹn | nỗi nhục nhã",
        "shame | embarrassment | disgrace","1421590"),
    row("恥辱","ちじょく","N3","n",
        "nhục nhã | sự ô nhục | xỉ nhục",
        "disgrace | shame | insult","1421670"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
