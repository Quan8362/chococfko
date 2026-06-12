# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-037.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 13 persistent ghosts + 2863507 度々(どど archaic) + 2861198 煙草(えんそう archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("類い","たぐい","N3","n",
        "loại | dạng | hạng | ngang bằng",
        "kind | sort | type | equal | match | peer","1596870"),
    row("竜巻","たつまき","N3","n",
        "lốc xoáy | vòi rồng | xoáy nước",
        "tornado | whirlwind | waterspout | twister","1597060"),
    row("建前","たてまえ","N3","n",
        "thái độ công khai | lập trường chính thức | mặt ngoài (đối lập với honne)",
        "face | official stance | public position or attitude (as opposed to private thoughts)","1597110"),
    row("例え","たとえ","N3","n",
        "ví dụ | so sánh | ẩn dụ | ngụ ngôn",
        "example | simile | metaphor | allegory | fable | parable","1597120"),
    row("煙草","タバコ","N3","n",
        "thuốc lá | xì gà | cây thuốc lá",
        "tobacco | cigarette | cigar | tobacco plant (Nicotiana tabacum)","1597150"),
    row("度々","たびたび","N3","adv",
        "nhiều lần | liên tục | thường xuyên",
        "often | again and again | over and over again | repeatedly | frequently","1597160"),
    row("探検","たんけん","N3","n|vs|vt",
        "thám hiểm | đoàn thám hiểm | khám phá",
        "exploration | expedition","1597250"),
    row("着々","ちゃくちゃく","N3","adv|adv-to",
        "từng bước | đều đặn | chắc chắn",
        "steadily","1597480"),
    row("茶碗","ちゃわん","N3","n",
        "bát ăn cơm | chén trà | chén",
        "rice bowl | tea cup | teacup","1597530"),
    row("中核","ちゅうかく","N3","n",
        "nòng cốt | hạt nhân | trung tâm | cốt lõi",
        "kernel | core | nucleus | center | centre","1597540"),
    row("兆候","ちょうこう","N3","n",
        "dấu hiệu | triệu chứng | điềm báo",
        "sign | indication | omen | symptom","1597620"),
    row("貯蓄","ちょちく","N3","n|vs|vt|vi",
        "tiết kiệm | tiền để dành | tích lũy",
        "savings","1597700"),
    row("直感的","ちょっかんてき","N3","adj-na",
        "trực giác | theo linh cảm",
        "intuitive","1597710"),
    row("使い捨て","つかいすて","N3","adj-no|n",
        "dùng một lần | dùng xong bỏ | đồ dùng một lần",
        "throwaway | disposable | single-use","1597750"),
    row("慎む","つつしむ","N3","v5m|vt",
        "thận trọng | kiềm chế | điều độ | giữ gìn",
        "to be careful | to be discreet | to do in moderation | to refrain (from overdoing) | to abstain","1598000"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
