# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-014.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 1708890 足取り, 2867035 家系, 2860958 既に (ghost entries)
# EXCLUDED: 2703560 大手おおで (full length of arm), 2752960 対面トイメン (mahjong)
# EXCLUDED: 2845086 大分おおいた (Ōita city), 2657290 大柄おおへい (arrogant reading)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("大統領","だいとうりょう","N3","n",
        "tổng thống | nguyên thủ quốc gia",
        "president (of a country) | big man | boss | buddy | mate","1414650"),
    row("大豆","だいず","N3","n",
        "đậu nành | đậu tương",
        "soya bean (Glycine max) | soybean | soy","1414680"),
    row("大麦","おおむぎ","N3","n",
        "lúa mạch | đại mạch",
        "barley (Hordeum vulgare)","1414780"),
    row("大仏","だいぶつ","N3","n",
        "tượng Phật lớn | Đại Phật",
        "large statue of Buddha (trad. at least 4.8m high)","1414890"),
    row("大分","だいぶ","N3","adv",
        "đáng kể | khá nhiều | rất nhiều",
        "considerably | greatly | a lot","1414920"),
    row("大幅","おおはば","N3","adj-na|n",
        "lớn | đáng kể | mạnh | vải khổ rộng",
        "big | large | drastic | substantial | full-width cloth","1414870"),
    row("大柄","おおがら","N3","adj-na|n|adj-no",
        "vóc người to | hoa văn lớn",
        "large build | large pattern","1414980"),
    row("大文字","おおもじ","N3","n",
        "chữ hoa | chữ viết hoa | ký tự lớn",
        "uppercase letter | capital letter | large character | large writing","1414950"),
    row("大部分","だいぶぶん","N3","n",
        "phần lớn | đại bộ phận | đa số",
        "most part | greater part | majority","1414850"),
    row("大理石","だいりせき","N3","n",
        "đá cẩm thạch",
        "marble","1415140"),
    row("大砲","たいほう","N3","n",
        "đại pháo | súng thần công | pháo binh",
        "(large) gun | cannon | artillery | long-ball hitter | home-run hitter","1415030"),
    row("大名","だいみょう","N3","n",
        "đại danh (lãnh chúa phong kiến Nhật Bản)",
        "daimyo (Japanese feudal lord)","1415080"),
    row("大量","たいりょう","N3","adj-na|adj-no|n",
        "số lượng lớn | khối lượng lớn | hàng loạt",
        "large quantity | massive (quantity) | mass (e.g. mass production, mass transit, mass destruction)","1415190"),
    row("大量生産","たいりょうせいさん","N3","n",
        "sản xuất hàng loạt",
        "mass production","1415200"),
    row("第一印象","だいいちいんしょう","N3","n",
        "ấn tượng đầu tiên",
        "first impression","1415290"),
    row("第三者","だいさんしゃ","N3","n",
        "người thứ ba | bên thứ ba | người ngoài | người không liên quan",
        "third party | third person | outsider | disinterested person","1415380"),
    row("醍醐味","だいごみ","N3","n",
        "niềm vui thật sự | cái thú đích thực | tinh túy | bản chất thực sự",
        "the real pleasure (of something) | the real thrill | the true charm","1415460"),
    row("題材","だいざい","N3","n",
        "chủ đề | đề tài",
        "subject | theme","1415480"),
    row("題名","だいめい","N3","n",
        "tên bài | tiêu đề | đề mục",
        "title | caption | heading","1415490"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
