# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-040.csv -- 13 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-040.csv"
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
    row("恩師","おんし","N4","n",
        "thầy ơn | người thầy đáng kính | thầy cũ đáng biết ơn",
        "teacher (to whom one owes a debt of gratitude) | mentor | one's former teacher",
        "1183160",
        "恩師に感謝する。","おんしにかんしゃする。",
        "Biết ơn người thầy đáng kính.","Be grateful to one's mentor."),
    row("花見","はなみ","N4","n|vs",
        "ngắm hoa anh đào | xem hoa sakura | hanami (tục lệ ngắm hoa Nhật)",
        "cherry blossom viewing | flower viewing",
        "1194660",
        "公園で花見をする。","こうえんではなみをする。",
        "Ngắm hoa anh đào trong công viên.","Do hanami in the park."),
    row("砂浜","すなはま","N4","n",
        "bãi cát | bãi biển cát",
        "sandy beach",
        "1291620",
        "砂浜を歩く。","すなはまをあるく。",
        "Đi bộ trên bãi cát.","Walk on the sandy beach."),
    row("秋風","あきかぜ","N4","n",
        "gió thu | làn gió mùa thu",
        "autumn breeze | fall breeze",
        "1332720",
        "秋風が吹く。","あきかぜがふく。",
        "Gió thu thổi.","The autumn breeze blows."),
    row("親戚","しんせき","N4","n",
        "họ hàng | người thân | bà con | thân thích",
        "relative | relation | kin",
        "1365230",
        "親戚が集まる。","しんせきがあつまる。",
        "Họ hàng tụ họp.","Relatives gather together."),
    row("水面","すいめん","N4","n",
        "mặt nước | bề mặt nước",
        "water's surface | surface of the water",
        "1372120",
        "水面に映る。","すいめんにうつる。",
        "Phản chiếu trên mặt nước.","Reflect on the water's surface."),
    row("川岸","かわぎし","N4","n",
        "bờ sông | ven sông",
        "riverbank | riverside",
        "1390060",
        "川岸を散歩する。","かわぎしをさんぽする。",
        "Đi dạo ven sông.","Take a walk along the riverbank."),
    row("峠","とうげ","N4","n",
        "đèo | đỉnh đèo | đường đèo | giai đoạn đỉnh điểm | điểm ngoặt",
        "(mountain) pass | highest point on a mountain road | ridge | peak (e.g. of an illness) | crisis point",
        "1454420",
        "峠を越える。","とうげをこえる。",
        "Vượt qua đèo.","Cross the mountain pass."),
    row("恩人","おんじん","N4","n",
        "ân nhân | người ơn | người có công",
        "benefactor | patron | person to whom one owes a great deal",
        "1183230",
        "命の恩人。","いのちのおんじん。",
        "Ân nhân cứu mạng.","A lifesaver."),
    row("朝露","あさつゆ","N4","n",
        "sương mai | giọt sương buổi sáng",
        "morning dew",
        "1428590",
        "朝露が草に光る。","あさつゆがくさにひかる。",
        "Sương mai lấp lánh trên cỏ.","Morning dew glistens on the grass."),
    row("朝露","ちょうろ","N4","n",
        "Bắc Triều Tiên và Nga | Triều Tiên và Nga (cách viết Hán tự)",
        "North Korea and Russia",
        "2849660",
        "朝露関係。","ちょうろかんけい。",
        "Quan hệ Triều-Nga.","North Korea-Russia relations."),
    row("紅葉","こうよう","N4","n|vs|vi",
        "lá đỏ mùa thu | lá cây đổi màu | sắc lá mùa thu",
        "leaves turning red (in autumn) | red leaves | autumn colours | fall colors | turning red",
        "1578780",
        "山の紅葉が美しい。","やまのこうようがうつくしい。",
        "Lá đỏ trên núi rất đẹp.","The autumn leaves on the mountain are beautiful."),
    row("紅葉","もみじ","N4","n",
        "cây phong Nhật | lá phong đỏ | lá đỏ mùa thu",
        "maple (tree) | red leaves (of autumn) | autumn colors | leaves changing color | venison",
        "2857870",
        "もみじの葉が赤い。","もみじのはがあかい。",
        "Lá cây phong đỏ.","The maple leaves are red."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
