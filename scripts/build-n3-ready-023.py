# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-023.csv"
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
    row("歴史的","れきしてき","N3","adj-na",
        "mang tính lịch sử | có tính lịch sử | lịch sử",
        "historical | traditional | historic","1558160"),
    row("歴代","れきだい","N3","n|adj-no",
        "các thế hệ liên tiếp | các đời | lịch đại",
        "successive generations | successive emperors","1558220"),
    row("歴任","れきにん","N3","n|vs|vt",
        "đảm nhiệm lần lượt | trải qua nhiều chức vụ",
        "successive jobs | consecutive jobs","1558270"),
    row("列挙","れっきょ","N3","n|vs|vt",
        "liệt kê | kê khai | nêu ra từng cái",
        "enumeration | list","1558340"),
    row("列島","れっとう","N3","n",
        "quần đảo | chuỗi đảo",
        "archipelago | chain of islands","1558390"),
    row("劣る","おとる","N3","v5r|vi",
        "kém hơn | thua kém | tụt hậu",
        "to be inferior to | to be less good at | to fall behind","1558400"),
    row("劣悪","れつあく","N3","adj-na",
        "kém cỏi | chất lượng kém | điều kiện tồi tệ",
        "poor (quality, conditions, etc.) | bad | inferior | poor-quality","1558410"),
    row("劣化","れっか","N3","n|vs|vi",
        "xuống cấp | suy giảm chất lượng | lão hóa | thoái hóa",
        "deterioration (in quality, performance, etc.) | degradation | worsening","1558420"),
    row("劣勢","れっせい","N3","n|adj-no|adj-na",
        "thua kém | thế yếu | bất lợi",
        "inferiority (e.g. numerical) | inferior position | disadvantage | unfavorable situation","1558480"),
    row("劣等感","れっとうかん","N3","n",
        "mặc cảm tự ti | cảm giác thua kém",
        "inferiority complex | sense of inferiority","1558520"),
    row("裂ける","さける","N3","v1|vi",
        "bị rách | bị toác ra | bị tách ra",
        "to split | to tear | to burst | to be separated | to be divided","1558610"),
    row("恋愛","れんあい","N3","n|vs|vi|adj-no",
        "tình yêu | tình cảm lãng mạn | yêu đương",
        "love | romance | tender passion | emotion | affections","1558800"),
    row("連休","れんきゅう","N3","n",
        "kỳ nghỉ liên tiếp | nghỉ liền mấy ngày",
        "consecutive holidays","1559380"),
    row("連携","れんけい","N3","n|vs|vi",
        "hợp tác | phối hợp | liên kết | cộng tác",
        "cooperation | coordination | collaboration | alignment | integration | linking","1559400"),
    row("連結","れんけつ","N3","n|vs|vt",
        "kết nối | ghép nối | liên kết | nối liền",
        "connection | linking | joining | coupling | attaching | junction | concatenation","1559410"),
    row("連合","れんごう","N3","n|vs|vt|vi",
        "liên minh | liên hợp | liên đoàn | liên kết",
        "union | combination | alliance | confederation | coalition | association","1559450"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
