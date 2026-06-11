# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-032.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("夏季","かき","N3","n",
        "mùa hè | thời tiết mùa hè",
        "summer season | summer | summertime","1589900"),
    row("過酷","かこく","N3","adj-na|n",
        "khắc nghiệt | tàn nhẫn | nghiêm khắc | khắc khổ",
        "severe | harsh | hard | cruel | rigorous","1590190"),
    row("箇所","かしょ","N3","n|ctr",
        "nơi | điểm | đoạn | vị trí | chỗ",
        "place | point | part | spot | area | passage | portion | counter for places, parts, passages, etc.","1590250"),
    row("片思い","かたおもい","N3","n",
        "tình yêu đơn phương | yêu đơn phương",
        "unrequited love | one-sided love","1590350"),
    row("肩書き","かたがき","N3","n",
        "chức danh | chức vụ | tiêu đề | bằng cấp",
        "title (e.g. Doctor, Professor, Lord) | job title | position (in a company) | degree | status","1590360"),
    row("偏る","かたよる","N3","v5r|vi",
        "lệch về một phía | bất cân bằng | thiên lệch | thiên vị | mất cân đối",
        "to lean (to one side) | to incline | to be unbalanced (e.g. diet) | to be partial | to be biased","1590420"),
    row("画期的","かっきてき","N3","adj-na",
        "đột phá | cách mạng | tiên phong | chưa từng có",
        "ground-breaking | revolutionary | unprecedented | epoch-making","1590470"),
    row("稼働","かどう","N3","n|vs|vt|vi",
        "vận hành (máy móc) | hoạt động | làm việc | triển khai",
        "operation (of a machine) | running | working (and earning money) | activity | deployment","1590520"),
    row("科目","かもく","N3","n",
        "môn học | chương trình học | khóa học | mục",
        "(school) subject | curriculum | course | item | heading | entry","1590600"),
    row("可哀想","かわいそう","N3","adj-na|n",
        "đáng thương | tội nghiệp | đáng tội",
        "poor | pitiable | pathetic | pitiful","1590740"),
    row("監査","かんさ","N3","n|vs|vt",
        "kiểm toán | kiểm tra | thẩm tra",
        "inspection | audit | judgement | judgment","1590860"),
    row("肝心","かんじん","N3","adj-na|adj-no|n",
        "thiết yếu | quan trọng | chủ chốt | cốt lõi",
        "essential | important | crucial | vital | main","1590870"),
    row("完璧","かんぺき","N3","adj-na|n",
        "hoàn hảo | không có tì vết | hoàn toàn",
        "perfect | complete | flawless","1590970"),
    row("起源","きげん","N3","n",
        "nguồn gốc | khởi đầu | xuất xứ",
        "origin | beginning | source","1591140"),
    row("兆し","きざし","N3","n",
        "dấu hiệu | điềm báo | triệu chứng",
        "sign | indication | omen | symptom","1591160"),
    row("奇跡","きせき","N3","n|adj-no",
        "kỳ tích | phép màu | điều kỳ diệu",
        "miracle | wonder | marvel","1591250"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
