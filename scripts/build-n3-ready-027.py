# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-027.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic reading)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("如何","どう","N3","adv",
        "cách nào | như thế nào | thế nào",
        "how | in what way | how about","1008910"),
    row("年々","ねんねん","N3","n|adv",
        "từng năm | mỗi năm | hàng năm | năm qua năm",
        "year by year | annually | every year | from year to year","1582860"),
    row("如何","いかん","N3","n|adv",
        "tùy theo | tùy thuộc vào | tính chất | kết quả là gì",
        "(depending on) how | (depending on) what | nature (of) | what is ...? | how is ...?","1582850"),
    row("拍子","ひょうし","N3","n",
        "nhịp điệu | nhịp | phách | khoảnh khắc | dịp | cơ hội",
        "time | meter | metre | rhythm | beat | the moment (of doing) | the instant | chance","1583030"),
    row("半年","はんとし","N3","n|adv",
        "nửa năm | sáu tháng",
        "half a year | six months","1583190"),
    row("不定","ふてい","N3","adj-no|adj-na|n",
        "không ổn định | bất định | không cố định | biến đổi | không chắc chắn",
        "unsettled | uncertain | indefinite | unfixed | variable | irregular | changeable","1583570"),
    row("分泌","ぶんぴつ","N3","n|vs|vt|vi",
        "sự tiết | tiết ra | bài tiết",
        "secretion","1583810"),
    row("年月","としつき","N3","n",
        "tháng năm | thời gian | tháng và năm",
        "months and years","1582870"),
    row("不定","ふじょう","N3","n|adj-na",
        "sự không chắc chắn | sự biến đổi | bất ổn",
        "uncertainty | mutability","2869404"),
    row("侮る","あなどる","N3","v5r|vt",
        "coi thường | khinh thường | khinh bỉ | coi nhẹ",
        "to disdain | to look down on | to make light of | to hold in contempt | to scorn | to despise","1583670"),
    row("如何","いかが","N3","adv|adj-na",
        "như thế nào | thế nào | ra sao",
        "how | in what way | how about | questionable","2845606"),
    row("描く","えがく","N3","v5k|vt",
        "vẽ | phác thảo | miêu tả | hình dung | tưởng tượng",
        "to draw | to paint | to sketch | to depict | to describe | to picture in one's mind | to imagine","1583460"),
    row("武士","ぶし","N3","n",
        "samurai | võ sĩ | chiến binh",
        "samurai | warrior","1583680"),
    row("発足","ほっそく","N3","n|vs|vi",
        "thành lập | khai mạc | ra mắt | khởi động",
        "starting | inauguration | launch | founding | establishment | start-up","1583130"),
    row("白髪","しらが","N3","n|adj-no",
        "tóc bạc | tóc trắng | đầu bạc",
        "white hair | grey hair | gray hair","1583050"),
    row("肌寒い","はださむい","N3","adj-i",
        "lành lạnh | hơi lạnh | se lạnh",
        "chilly | unpleasantly cold","1583660"),
    row("避ける","さける","N3","v1|vt|vi",
        "tránh | né tránh | lẩn tránh | tránh xa",
        "to avoid (physical contact with) | to avoid (situation) | to evade (question, subject) | to shirk","1583260"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
