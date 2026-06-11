# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-011.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("騒ぎ","さわぎ","N3","n|vs|vi",
        "náo loạn | ồn ào | hỗn loạn | sự khuấy động",
        "uproar | disturbance | brouhaha | ado | fuss | commotion","1403020"),
    row("騒音","そうおん","N3","n",
        "tiếng ồn | âm thanh hỗn loạn",
        "noise | din","1403060"),
    row("増加","ぞうか","N3","n|vs|vi",
        "tăng | tăng lên | gia tăng",
        "increase | rise | growth | addition | increment","1403160"),
    row("増強","ぞうきょう","N3","n|vs|vt",
        "tăng cường | củng cố | mạnh thêm",
        "reinforcement | augmentation | strengthening | increase | buildup","1403190"),
    row("増大","ぞうだい","N3","n|vs|vi",
        "tăng lớn | mở rộng | gia tăng",
        "enlargement | increase","1403310"),
    row("増税","ぞうぜい","N3","n|vs",
        "tăng thuế",
        "tax increase","1403280"),
    row("憎しみ","にくしみ","N3","n",
        "sự căm ghét | lòng thù hận",
        "hatred","1403400"),
    row("憎悪","ぞうお","N3","n|vs|vt",
        "căm ghét | thù hận | ghét cay ghét đắng",
        "hatred | abhorrence | loathing | detestation","1403460"),
    row("臓器","ぞうき","N3","n",
        "nội tạng | cơ quan nội tạng",
        "internal organs | viscera","1403480"),
    row("贈呈","ぞうてい","N3","n|vs|vt",
        "tặng (quà, giải thưởng) | kính tặng | trình tặng",
        "presentation (of a gift, prize, etc.) | bestowal | conferment","1403570"),
    row("造船","ぞうせん","N3","n|vs",
        "đóng tàu | công nghiệp đóng tàu",
        "shipbuilding","1403720"),
    row("促進","そくしん","N3","n|vs|vt",
        "thúc đẩy | đẩy nhanh | xúc tiến",
        "promotion | acceleration | encouragement | facilitation","1403780"),
    row("側近","そっきん","N3","adj-no|n",
        "cận thần | người thân cận | cộng sự thân tín",
        "close aide (of a powerful person) | close associate | entourage","1403890"),
    row("俗語","ぞくご","N3","n",
        "tiếng lóng | từ bình dân | ngôn ngữ thông tục",
        "colloquialism | colloquial language | slang","1405300"),
    row("多忙","たぼう","N3","adj-na|n",
        "rất bận rộn | bận tíu tít | bận không có thời gian",
        "being very busy | busyness","1408040"),
    row("多様","たよう","N3","adj-na|n",
        "đa dạng | phong phú | nhiều loại",
        "diverse | various | varied | multifaceted","1408100"),
    row("多様性","たようせい","N3","n",
        "sự đa dạng | tính đa dạng",
        "diversity | variety","1408120"),
    row("太鼓","たいこ","N3","n",
        "trống taiko | trống truyền thống Nhật",
        "drum","1408280"),
    row("堕落","だらく","N3","n|vs|vi",
        "sa ngã | thoái hóa | trụy lạc | suy đồi",
        "depravity | corruption | degradation | degeneration","1408480"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
