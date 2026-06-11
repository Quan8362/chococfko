# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-055.csv -- 5 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-055.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id,
        ex_jp="", ex_rd="", ex_vi="", ex_en=""):
    return ",".join([
        q(word), q(reading), q(""), q(lvl), q(pos),
        q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"),
        q(ex_jp), q(ex_rd), q(ex_vi), q(ex_en),
        q("ai_draft"), q("jmdict_ai"),
    ])

ROWS = [
    row("たった","たった","N4","adj-f|adv",
        "chỉ | chỉ vậy thôi | nhưng | không hơn",
        "only | merely | but | no more than",
        "1007230",
        "たった一人で。","たったひとりで。",
        "Chỉ một mình.","Entirely alone."),
    row("約","やく","N4","adv|n",
        "khoảng | gần | lời hứa | hẹn | hôn ước | rút ngắn | giảm bớt | đơn giản hóa | co rút (ngữ âm)",
        "approximately | about | promise | appointment | engagement | shortening | reduction | simplification | contraction (in phonetics)",
        "1538100",
        "約10分かかる。","やく10ぷんかかる。",
        "Mất khoảng 10 phút.","It takes about 10 minutes."),
    row("打ち込む","うちこむ","N4","v5m|vt",
        "đóng vào (đinh, cọc) | đóng bằng búa | đánh (bóng) | đánh mạnh | đập mạnh | bắn vào | bắn vào trong | nhập (dữ liệu) | nhập | cống hiến hết mình | đắm chìm vào | thực sự mê | nhiệt tình với | đặt hết tâm huyết | dấn thân vào | phải lòng | luyện tập đánh (bóng chày/tennis) | đánh đối thủ (kendo/boxing) | ghi điểm bằng cú đánh | xâm chiếm lãnh thổ đối thủ | đặt quân vào thế trận đối thủ | đổ (bê tông) vào khuôn",
        "to drive in (a nail, stake, etc.) | to hammer in | to hit (a ball, etc.) | to drive | to smash | to fire into | to shoot into | to input (data) | to enter | to devote oneself to | to be absorbed in | to be (really) into | to be enthusiastic about | to put heart and soul into | to throw oneself into | to go head over heels for | to practice hitting (baseball, tennis, etc.) | to hit (an opponent in kendo, boxing, etc.) | to get a blow in | to invade one's opponent's territory | to place a stone in an opponent's formation | to pour (concrete, etc.) into a form",
        "1581440",
        "仕事に打ち込む。","しごとにうちこむ。",
        "Dấn thân vào công việc.","Devote oneself to work."),
    row("処方","しょほう","N4","n|vs|vt",
        "đơn thuốc (thuốc) | công thức",
        "prescription (of medicine) | formula",
        "1342500",
        "医者が処方する。","いしゃがしょほうする。",
        "Bác sĩ kê đơn.","The doctor prescribes."),
    row("相当","そうとう","N4","n|vs|vi|adj-no|adj-na|adv",
        "tương ứng (về nghĩa/chức năng) | tương đương với | thích hợp | phù hợp | xứng đáng | tỷ lệ | tương xứng với | hợp với | xứng đáng nhận | xứng đáng với | đáng kể | thực chất | đáng kể | khá | khá | vừa phải | kha khá",
        "corresponding to (in meaning, function, etc.) | being equivalent to | appropriate | suitable | befitting | proportionate | to be proportionate to | to be in keeping with | to be deserving of | to be worthy of | considerable | substantial | considerably | rather | quite | fairly | pretty",
        "1401240",
        "相当な経験がある。","そうとうなけいけんがある。",
        "Có kinh nghiệm đáng kể.","Have considerable experience."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
