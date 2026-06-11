# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-002.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    # 学習 - 2 parts
    row("学習","がくしゅう","N3","n|vs|vt",
        "học tập | nghiên cứu",
        "learning | study","1206820"),
    # 検討 - 8 parts
    row("検討","けんとう","N3","n|vs|vt",
        "xem xét | kiểm tra | điều tra | nghiên cứu | xem xét kỹ lưỡng | thảo luận | phân tích | đánh giá",
        "consideration | examination | investigation | study | scrutiny | discussion | analysis | review","1258000"),
    # 肯定 - 2 parts
    row("肯定","こうてい","N3","n|vs|vt",
        "khẳng định | tán thành",
        "affirmation | affirmative","1281180"),
    # 指摘 - 2 parts
    row("指摘","してき","N3","n|vs|vt",
        "chỉ ra | xác định",
        "pointing out | identification","1309940"),
    # 事実 - 3 parts
    row("事実","じじつ","N3","adv|n",
        "sự thật | thực tế | thực tế là",
        "fact | truth | reality","1313960"),
    # 損害 - 3 parts
    row("損害","そんがい","N3","n|vs|vt",
        "thiệt hại | tổn thất | mất mát",
        "damage | injury | loss","1406710"),
    # 認識 - 8 parts
    row("認識","にんしき","N3","n|vs|vt",
        "nhận thức | ý thức | nhận biết | hiểu biết | kiến thức | nhận thức (tâm lý) | nhận biết | thừa nhận",
        "recognition | awareness | perception | understanding | knowledge | cognition | cognizance | cognisance","1467550"),
    # 世代 - 1 part
    row("世代","せだい","N3","n",
        "thế hệ",
        "generation","1374190"),
    # 企業 - 4 parts
    row("企業","きぎょう","N3","n",
        "doanh nghiệp | kinh doanh | công ty | tập đoàn",
        "enterprise | business | company | corporation","1218190"),
    # 否定 - 6 parts
    row("否定","ひてい","N3","n|vs|vt",
        "phủ nhận | phủ định | bác bỏ | từ chối | phủ nhận | phép NOT (máy tính)",
        "denial | negation | repudiation | disavowal | negation | NOT operation","1482990"),
    # 政策 - 2 parts
    row("政策","せいさく","N3","n",
        "biện pháp chính trị | chính sách",
        "political measures | policy","1375950"),
    # 業界 - 3 parts
    row("業界","ぎょうかい","N3","n",
        "thế giới kinh doanh | giới kinh doanh | ngành công nghiệp",
        "business world | business circles | (the) industry","1239380"),
    # 姿勢 - 8 parts
    row("姿勢","しせい","N3","n",
        "tư thế | dáng đứng | vị trí | lập trường | dáng vẻ (cơ thể) | thái độ | cách tiếp cận | quan điểm",
        "posture | pose | position | stance | carriage (of the body) | attitude | approach | stance","1307740"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
