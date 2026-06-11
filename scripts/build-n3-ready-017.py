# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-017.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 1708890 足取り, 2867035 家系, 2860958 既に (ghost)
# EXCLUDED: 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい
# EXCLUDED: 2844618 断行だんぎょう (asceticism), 2120840 男女おとこおんな (mannish woman variant)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("段ボール","ダンボール","N3","n",
        "bìa carton | thùng carton",
        "(corrugated) cardboard | cardboard box | carton","1419930"),
    row("男子","だんし","N3","n",
        "nam giới | con trai | đàn ông",
        "boy | man | male","1420070"),
    row("男爵","だんしゃく","N3","n",
        "nam tước",
        "baron | Irish cobbler (variety of potato)","1420100"),
    row("男女","だんじょ","N3","n",
        "nam nữ | đàn ông và phụ nữ",
        "men and women | man and woman | both sexes | both genders","1420110"),
    row("男女同権","だんじょどうけん","N3","n",
        "bình đẳng giới | bình đẳng nam nữ",
        "equal rights among men and women","1420120"),
    row("男装","だんそう","N3","n|adj-no|vs|vi",
        "giả trang thành đàn ông | mặc đồ nam",
        "disguising oneself as a man | dressing as a man (for a woman) | male clothing","1420190"),
    row("男優","だんゆう","N3","n",
        "nam diễn viên",
        "(male) actor","1420230"),
    row("談笑","だんしょう","N3","n|vs|vi",
        "trò chuyện vui vẻ | nói chuyện nhẹ nhàng | hàn huyên",
        "friendly chat | pleasant chat | lighthearted talk | friendly conversation","1420270"),
    row("値切る","ねぎる","N3","v5r|vt",
        "mặc cả | ép giá | trả giá",
        "to drive a bargain | to beat down the price | to haggle","1420320"),
    row("知覚","ちかく","N3","n|vs|vt",
        "nhận thức | tri giác | cảm nhận",
        "perception | sensation | awareness","1420510"),
    row("知恵","ちえ","N3","n",
        "trí khôn | sự khôn ngoan | trí tuệ",
        "wisdom | wit | sagacity | sense | intelligence | prajna (insight leading to enlightenment)","1420530"),
    row("知見","ちけん","N3","n",
        "kiến thức | hiểu biết | quan điểm | thông tin",
        "knowledge | information | opinion | view","1420560"),
    row("知性","ちせい","N3","n",
        "trí tuệ | trí thông minh",
        "intelligence","1420630"),
    row("知的","ちてき","N3","adj-na",
        "trí thức | có trí tuệ | thuộc tri thức",
        "intellectual","1420650"),
    row("知能","ちのう","N3","n",
        "trí tuệ | trí lực | chỉ số thông minh",
        "intelligence | intellect | brains","1420680"),
    row("知名度","ちめいど","N3","n",
        "mức độ nổi tiếng | độ phổ biến | mức độ được biết đến",
        "degree of familiarity | popularity | name recognition | notoriety","1420700"),
    row("地位","ちい","N3","n",
        "địa vị | vị trí xã hội | chức vụ | cương vị",
        "(social) position | status | standing | position (in a company, organization, etc.) | post | rank","1420780"),
    row("地下街","ちかがい","N3","n",
        "khu mua sắm ngầm | phố ngầm",
        "underground shopping center | underground shopping centre","1420870"),
    row("地価","ちか","N3","n",
        "giá đất",
        "the price of land","1420930"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
