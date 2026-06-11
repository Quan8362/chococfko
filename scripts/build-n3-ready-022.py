# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-022.csv"
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
    row("累積","るいせき","N3","n|vs|vt|vi|adj-f",
        "tích lũy | tích tụ | cộng dồn",
        "accumulation | cumulative | accumulated","1556030"),
    row("類似","るいじ","N3","n|vs|vi|adj-no",
        "giống nhau | tương tự | giống với",
        "resemblance | similarity | likeness | analogy","1556100"),
    row("類推","るいすい","N3","n|vs|vt",
        "loại suy | suy luận tương tự | suy diễn tương đồng",
        "analogy | analogical reasoning | analogical inference | analogy","1556120"),
    row("例年","れいねん","N3","n|adv",
        "năm bình thường | hàng năm | thường niên",
        "average (normal, ordinary) year | every year | annually","1556570"),
    row("冷却","れいきゃく","N3","n|vs|vt|vi",
        "làm mát | làm lạnh | hạ nhiệt | nguội bớt",
        "cooling | refrigeration | cooling down (of a political conflict, etc.) | calming down","1556870"),
    row("冷酷","れいこく","N3","adj-na|n",
        "tàn nhẫn | vô tình | lạnh lùng | không thương xót",
        "cruelty | coldheartedness | relentless | ruthless","1556980"),
    row("冷笑","れいしょう","N3","n|vs|vt",
        "cười khẩy | mỉa mai | cười nhạo | chế giễu",
        "sneer | derision | scornful laugh | cold smile","1557000"),
    row("冷戦","れいせん","N3","n",
        "chiến tranh lạnh | Chiến tranh Lạnh",
        "cold war | the Cold War","1557060"),
    row("冷淡","れいたん","N3","adj-na|n",
        "thờ ơ | lãnh đạm | lạnh nhạt | vô cảm",
        "cool | indifferent | apathetic | half-hearted | cold | cold-hearted | heartless | unkind","1557150"),
    row("冷凍","れいとう","N3","n|vs|vt",
        "đông lạnh | cấp đông | bảo quản lạnh",
        "freezing | cold storage | refrigeration","1557170"),
    row("励む","はげむ","N3","v5m|vi",
        "cố gắng | nỗ lực | hết sức | chuyên cần",
        "to work hard | to try hard | to strive | to endeavour | to endeavor | to devote oneself to","1557390"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
