# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-019.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("置き引き","おきびき","N3","n|vs|vt",
        "trộm hành lý | lấy trộm túi xách",
        "walking off with someone's bag | luggage theft | luggage thief","1421810"),
    row("痴漢","ちかん","N3","n",
        "kẻ sờ mó bậy | kẻ quấy rối tình dục | biến thái",
        "molester | groper | masher | pervert | fool | idiot","1421710"),
    row("痴呆","ちほう","N3","n",
        "sa sút trí tuệ | mất trí | ngớ ngẩn",
        "dementia | stupidity | foolishness | fool | idiot","1421750"),
    row("中心的","ちゅうしんてき","N3","adj-na",
        "trung tâm | chủ chốt | cốt lõi",
        "central | mainline","1424600"),
    row("中世","ちゅうせい","N3","n",
        "thời trung đại | thời trung cổ",
        "Middle Ages (in Japan esp. the Kamakura and Muromachi periods) | medieval times | mediaeval times","1424690"),
    row("中絶","ちゅうぜつ","N3","n|vs|vt|vi",
        "phá thai | gián đoạn | đình chỉ",
        "abortion | discontinuance | stoppage | suspension | interruption","1424820"),
    row("中退","ちゅうたい","N3","n|vs|vi",
        "bỏ học giữa chừng | thôi học",
        "leaving school during a term","1424880"),
    row("中断","ちゅうだん","N3","n|vs|vt|vi",
        "gián đoạn | tạm dừng | ngắt quãng",
        "interruption | suspension | break","1424900"),
    row("中だるみ","なかだるみ","N3","n|vs|vi",
        "giai đoạn trì trệ | uể oải giữa chừng | chùng xuống",
        "slump | lull | becoming slack (of a rope, etc.)","1424920"),
    row("中庭","なかにわ","N3","n",
        "sân trong | sân nội thất",
        "courtyard | quadrangle | middle court","1424980"),
    row("中途","ちゅうと","N3","n",
        "giữa chừng | nửa chừng | dở dang",
        "halfway | midway | partway | mid-course","1425030"),
    row("中東","ちゅうとう","N3","n",
        "Trung Đông",
        "Middle East","1425080"),
    row("中等","ちゅうとう","N3","n|adj-no",
        "trung bình | hạng trung | trung học (chất lượng)",
        "second grade | medium quality | average | middle class | secondary grade","1425090"),
    row("中毒","ちゅうどく","N3","n|vs|vi|n-suf",
        "ngộ độc | nghiện | trúng độc",
        "poisoning | addiction","1425160"),
    row("中南米","ちゅうなんべい","N3","n",
        "Trung và Nam Mỹ | Châu Mỹ Latinh",
        "Central and South America","1425170"),
    row("中入り","なかいり","N3","n",
        "giờ giải lao | khoảng nghỉ giữa giờ | màn nghỉ",
        "intermission (during a play, sumo, etc.) | interval","1425230"),
    row("中年","ちゅうねん","N3","n|adj-no",
        "tuổi trung niên | trung tuổi",
        "middle-age | middle age | midlife | one's middle years","1425240"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
