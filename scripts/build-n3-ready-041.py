# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-041.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("響き","ひびき","N3","n",
        "tiếng vang | âm vang | tiếng dội | cảm xúc gợi lên",
        "echo | reverberation | sound (esp. the distinctive sound of an object or activity) | noise | quality of a sound","1602130"),
    row("比喩","ひゆ","N3","n",
        "so sánh | ẩn dụ | ngụ ngôn | ví von",
        "simile | metaphor | allegory | parable","1602260"),
    row("日焼け","ひやけ","N3","n|vs|vi",
        "rám nắng | cháy nắng | cháy da",
        "sunburn | suntan | tan | becoming discolored from the sun (e.g. of paper) | yellowing","1602220"),
    row("不意打ち","ふいうち","N3","n",
        "tấn công bất ngờ | bất ngờ ghé thăm | làm ai bất ngờ",
        "surprise attack | surprise visit | catching a person off guard","1602430"),
    row("吹き替え","ふきかえ","N3","n",
        "lồng tiếng | thay người diễn | người thay thế",
        "dubbing (of a film, etc. into a different language) | stand-in (actor) | double","1602490"),
    row("普段着","ふだんぎ","N3","n",
        "quần áo thường ngày | trang phục hàng ngày",
        "everyday clothes | ordinary clothes | casual wear | informal dress","1602740"),
    row("二日酔い","ふつかよい","N3","n|vs|vi",
        "hậu say rượu | say xỉn sáng hôm sau",
        "hangover","1602760"),
    row("普遍","ふへん","N3","adj-no|n",
        "phổ quát | toàn diện | khắp nơi",
        "universal | general | ubiquitous | omnipresent","1602820"),
    row("不要","ふよう","N3","adj-na|adj-no|n",
        "không cần thiết | thừa | vô dụng",
        "unnecessary | unneeded","1602900"),
    row("振込","ふりこみ","N3","n",
        "chuyển khoản | thanh toán chuyển khoản",
        "payment made via bank deposit transfer","1602960"),
    row("故郷","ふるさと","N3","n",
        "quê hương | quê nhà | nơi sinh | mảnh đất quê",
        "hometown | birthplace | native place | one's old home | ruins | historic remains","1603050"),
    row("付録","ふろく","N3","n",
        "phụ lục | bổ sung | phần kèm theo",
        "appendix | supplement | annex | extra (of a newspaper or magazine)","1603100"),
    row("編集","へんしゅう","N3","n|vs|vt",
        "biên tập | biên soạn | chỉnh sửa",
        "editing | compilation","1603240"),
    row("故郷","こきょう","N3","n",
        "quê hương | quê nhà | nơi sinh | mảnh đất cố hương",
        "hometown | birthplace | native place | one's old home","2853884"),
    row("ほうれん草","ほうれんそう","N3","n",
        "rau bina | cây rau chân vịt",
        "spinach (Spinacia oleracea)","1603410"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
