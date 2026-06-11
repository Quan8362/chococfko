# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-012.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("妥協","だきょう","N3","n|vs|vi",
        "thỏa hiệp | nhượng bộ | dàn xếp",
        "compromise | giving in","1408510"),
    row("妥当","だとう","N3","adj-na|n",
        "hợp lý | phù hợp | chính đáng | thích hợp",
        "valid | proper | right | appropriate | reasonable","1408540"),
    row("惰性","だせい","N3","n",
        "quán tính | thói quen cũ | sức ỳ",
        "force of habit | inertia","1408570"),
    row("打開","だかい","N3","n|vs",
        "phá vỡ bế tắc | mở ra lối thoát | phá băng",
        "break in the deadlock | development | getting out of a rut","1408850"),
    row("打撃","だげき","N3","n",
        "cú đánh | cú sốc | thiệt hại nặng nề | đánh (bóng chày)",
        "blow | shock | strike | damage | batting","1408870"),
    row("打倒","だとう","N3","n|vs|vt",
        "lật đổ | đánh bại | hạ gục",
        "overthrow | defeat | bringing down | knockdown","1408940"),
    row("体格","たいかく","N3","n",
        "vóc dáng | thể hình | cấu tạo cơ thể",
        "build | physique | frame | constitution","1409310"),
    row("体系","たいけい","N3","n",
        "hệ thống | cấu trúc | kiến trúc (hệ thống)",
        "system | organization | organisation | architecture","1409390"),
    row("体験","たいけん","N3","n|vs|vt",
        "trải nghiệm thực tế | kinh nghiệm bản thân",
        "(practical) experience | personal experience | hands-on experience","1409420"),
    row("体制","たいせい","N3","n",
        "hệ thống | chế độ | cơ cấu tổ chức | cơ chế",
        "order | system | structure | set-up | organization | regime","1409550"),
    row("体調","たいちょう","N3","n",
        "trạng thái sức khỏe | tình trạng cơ thể | thể trạng",
        "physical condition | state of health | shape","1409610"),
    row("体面","たいめん","N3","n",
        "danh dự | thể diện | uy tín",
        "honour | honor | dignity | prestige | reputation | appearances","1409700"),
    row("対外","たいがい","N3","adj-no|n",
        "đối ngoại | liên quan đến nước ngoài",
        "external | foreign | with foreign countries | towards foreign countries","1409880"),
    row("対決","たいけつ","N3","n|vs|vi",
        "đối mặt | đối đầu | phân thắng bại",
        "confrontation | showdown","1410000"),
    row("対抗","たいこう","N3","n|vs|vi",
        "đối kháng | cạnh tranh | chống lại",
        "opposition | rivalry | competition | antagonism","1410020"),
    row("対処","たいしょ","N3","n|vs|vi",
        "xử lý | đối phó | giải quyết",
        "dealing with | coping with","1410070"),
    row("対照","たいしょう","N3","n|vs|vt",
        "tương phản | đối chiếu | so sánh",
        "contrast | antithesis | comparison","1410080"),
    row("対象","たいしょう","N3","n",
        "đối tượng | chủ thể | mục tiêu",
        "target | object (of worship, study, etc.) | subject (of an action)","1410120"),
    row("対等","たいとう","N3","adj-na|adj-no|n",
        "bình đẳng | ngang hàng | bình đẳng về địa vị",
        "equality (esp. of status) | equal footing | equal terms","1410250"),
    row("対談","たいだん","N3","n|vs|vi",
        "đàm thoại | trò chuyện | đối thoại",
        "talk | dialogue | conversation","1410230"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
