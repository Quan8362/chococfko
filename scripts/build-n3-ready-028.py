# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-028.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("保健所","ほけんじょ","N3","n",
        "trung tâm y tế | trạm y tế | nơi chăm sóc sức khỏe",
        "health care center | health care centre | animal shelter","1584000"),
    row("墓地","ぼち","N3","n",
        "nghĩa địa | khu chôn cất",
        "cemetery | graveyard","1584040"),
    row("宝物","たからもの","N3","n",
        "kho báu | vật quý | tài sản quý giá",
        "treasure | treasured item | prized possession","1584080"),
    row("末路","まつろ","N3","n",
        "những ngày cuối | kết cục | số phận | đoạn đường cuối",
        "last days | the end | one's fate","1584440"),
    row("万全","ばんぜん","N3","n|adj-no|adj-na",
        "hoàn hảo | không có sai sót | toàn vẹn",
        "perfection | flawlessness","1584510"),
    row("万能","ばんのう","N3","adj-no|n",
        "đa năng | toàn năng | vạn năng | vô sở bất năng",
        "all-purpose | utility | universal | all-powerful | almighty | omnipotent","1584530"),
    row("未曾有","みぞう","N3","adj-no|n",
        "chưa từng có | chưa từng xảy ra | kỷ lục",
        "unprecedented | unheard-of | record-breaking","1584590"),
    row("免れる","まぬがれる","N3","v1|vt",
        "thoát khỏi | được cứu khỏi | tránh được | thoát được | được miễn",
        "to escape (disaster, death, etc.) | to be saved from | to avoid (e.g. punishment) | to be exempted from","1584670"),
    row("妄想","もうそう","N3","n|vs|vt",
        "ảo tưởng | hoang tưởng | tưởng tượng hoang đường",
        "delusion | wild idea | (wild) fancy | (ridiculous) fantasy","1584730"),
    row("融通","ゆうずう","N3","n|vs|vt",
        "cho vay | khả năng thích nghi | linh hoạt | uyển chuyển",
        "lending (money, commodities, etc.) | finance | loan | adaptability | versatility | flexibility","1584900"),
    row("翌朝","よくあさ","N3","n|adv",
        "sáng hôm sau | sáng ngày hôm sau",
        "next morning","1585000"),
    row("来客","らいきゃく","N3","n",
        "khách đến thăm | người ghé thăm",
        "visitor | caller","1585030"),
    row("流行","りゅうこう","N3","n|vs|vi|adj-no",
        "mốt | xu hướng | trào lưu | phổ biến | dịch bệnh | lan rộng",
        "fashion | trend | vogue | craze | fad | popularity | prevalence (of a disease) | epidemic","1585110"),
    row("予言","よげん","N3","n|vs|vt",
        "dự đoán | tiên tri | tiên đoán | lời tiên tri",
        "prediction | prophecy | prognostication | foretelling | forecast | (religious) prophecy","1584920"),
    row("予言","かねごと","N3","n",
        "lời hứa | dự đoán",
        "promise | prediction","2826481"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
