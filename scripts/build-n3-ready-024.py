# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-024.csv"
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
    row("連帯","れんたい","N3","n|vs|vi|adj-f",
        "đoàn kết | liên đới | tập thể",
        "solidarity | joint | collective","1559660"),
    row("連日","れんじつ","N3","n|adj-no|adv",
        "ngày qua ngày | hàng ngày | mỗi ngày",
        "day after day | every day","1559720"),
    row("連邦","れんぽう","N3","n",
        "liên bang | liên hiệp quốc | khối liên kết",
        "federation (of states) | confederation | commonwealth | union","1559790"),
    row("連盟","れんめい","N3","n",
        "liên minh | liên đoàn | liên hiệp",
        "league | federation | union","1559870"),
    row("連立","れんりつ","N3","n|vs|vi",
        "liên minh | liên hiệp | liên kết đứng cạnh nhau",
        "coalition | alliance | union | standing side-by-side","1559960"),
    row("露出","ろしゅつ","N3","n|vs|vt|vi",
        "lộ ra | phơi bày | phơi nắng | tiếp xúc | xuất hiện (trên truyền thông)",
        "exposure | laying bare | baring (e.g. skin) | (media) exposure | appearance (on TV, etc.)","1560130"),
    row("露天風呂","ろてんぶろ","N3","n",
        "bồn tắm ngoài trời | rotenburo",
        "open-air bath | rotenburo | rotemburo","1560180"),
    row("労う","ねぎらう","N3","v5u|vt",
        "cảm ơn (về công sức) | tưởng thưởng | ghi nhận nỗ lực",
        "to show appreciation for (efforts) | to thank for | to reward for","1560220"),
    row("朗読","ろうどく","N3","n|vs|vt",
        "đọc to | đọc thành tiếng | ngâm thơ",
        "reading aloud | recitation","1560730"),
    row("浪人","ろうにん","N3","n|vs|vi",
        "ronin | samurai thất nghiệp | học sinh thi lại đại học | người không có việc làm",
        "ronin | masterless samurai | high school graduate waiting to retake university entrance exam | jobless person","1560780"),
    row("老後","ろうご","N3","n",
        "tuổi già | lúc về già | cuối đời",
        "old age","1561040"),
    row("老衰","ろうすい","N3","n|vs|vi|adj-no",
        "suy yếu do tuổi già | lão suy | già nua",
        "senility | senile decay | infirmity (through age)","1561120"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
