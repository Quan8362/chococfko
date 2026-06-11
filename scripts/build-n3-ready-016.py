# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-016.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 1708890 足取り, 2867035 家系, 2860958 既に (ghost)
# EXCLUDED: 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい
# EXCLUDED: 2844618 断行だんぎょう (asceticism reading, not the resolute-action one)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("脱出","だっしゅつ","N3","n|vs|vi",
        "thoát ra | trốn thoát | thoát khỏi",
        "escape | getting away (from) | getting out (of)","1416520"),
    row("脱税","だつぜい","N3","n|vs|vt|vi|adj-no",
        "trốn thuế | lậu thuế",
        "tax evasion","1416550"),
    row("脱線","だっせん","N3","n|vs|vi",
        "trật bánh tàu | lạc đề | đi chệch hướng",
        "derailment | digression | deviation","1416560"),
    row("脱退","だったい","N3","n|vs|vi",
        "rút lui | rút khỏi tổ chức | ly khai",
        "withdrawal (e.g. from an organization) | secession | leaving | pulling out","1416570"),
    row("脱帽","だつぼう","N3","n|vs|vi",
        "cởi mũ | kính phục | khâm phục",
        "removing one's hat | admiring (someone) greatly | taking one's hat off to","1416620"),
    row("脱毛","だつもう","N3","n|vs",
        "rụng tóc | triệt lông | tẩy lông",
        "hair loss | hair removal | epilation | depilation","1416630"),
    row("たどり着く","たどりつく","N3","v5k|vi",
        "cuối cùng đến được | lần mò đến | vất vả tìm đến",
        "to (finally) arrive at | to reach (at last) | to (manage to) get to | to find one's way to","1416680"),
    row("棚上げ","たなあげ","N3","n|vs|vt",
        "gác lại | hoãn lại | đình chỉ | để tạm một bên",
        "shelving (a matter, plan, etc.) | pigeonholing | tabling | putting aside | putting on hold","1416730"),
    row("断固","だんこ","N3","adj-t|adv-to",
        "kiên quyết | quyết đoán | dứt khoát",
        "firm | determined | resolute | conclusive","1419600"),
    row("断行","だんこう","N3","n|vs|vt",
        "thực hiện quyết đoán | hành động dứt khoát | kiên quyết tiến hành",
        "decisive action | carrying out | resolute enforcement | execution","1419620"),
    row("断食","だんじき","N3","n|vs|vi",
        "nhịn ăn | tuyệt thực",
        "fasting | fast","1419650"),
    row("断水","だんすい","N3","n|vs|vt|vi",
        "cắt nước | ngừng cấp nước",
        "suspension of water supply | water outage","1419660"),
    row("断層","だんそう","N3","n",
        "đứt gãy địa chất | khoảng cách | sự chênh lệch",
        "fault | dislocation | gap | discrepancy","1419700"),
    row("断定","だんてい","N3","n|vs|vt",
        "kết luận | khẳng định | phán quyết",
        "conclusion | decision | judgement | declaration | affirmative","1419740"),
    row("断念","だんねん","N3","n|vs|vt",
        "từ bỏ | bỏ cuộc | từ bỏ hy vọng",
        "abandoning (hope, plans) | giving up","1419780"),
    row("断片","だんぺん","N3","n",
        "mảnh vỡ | mảnh nhỏ | đoạn rời",
        "fragment | scrap | piece | shred","1419790"),
    row("断面","だんめん","N3","n",
        "mặt cắt | thiết diện | tiết diện",
        "section | cross section | profile","1419810"),
    row("暖炉","だんろ","N3","n",
        "lò sưởi | lò lửa",
        "fireplace | hearth | stove","1419900"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
