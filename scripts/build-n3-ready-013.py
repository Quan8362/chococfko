# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-013.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 1708890 足取り, 2867035 家系, 2860958 既に (ghost entries)
# EXCLUDED: 2703560 大手おおで (wrong reading — "full length of arm"), 2752960 対面トイメン (mahjong)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("対比","たいひ","N3","n|vs|vt",
        "tương phản | đối chiếu | so sánh | tương quan",
        "contrast | juxtaposition | comparison | correlation (of strata)","1410260"),
    row("対面","たいめん","N3","n|vs|vi|adj-no",
        "gặp mặt trực tiếp | gặp gỡ | đối mặt | đối diện | đương đầu",
        "meeting face-to-face | seeing in person | facing (each other) | opposing (traffic, etc.) | confronting","1410270"),
    row("大気","たいき","N3","n",
        "khí quyển | không khí | tính hào phóng | sự hào hiệp",
        "atmosphere | air | magnanimity | generosity","1413330"),
    row("大気汚染","たいきおせん","N3","n",
        "ô nhiễm không khí",
        "air pollution","1413340"),
    row("大規模","だいきぼ","N3","adj-na|n",
        "quy mô lớn",
        "large-scale","1413350"),
    row("大型","おおがた","N3","adj-no|n",
        "cỡ lớn | loại lớn | quy mô lớn",
        "large | large-sized | large-scale | big","1413530"),
    row("大工","だいく","N3","n",
        "thợ mộc",
        "carpenter","1413690"),
    row("大使","たいし","N3","n|adj-no",
        "đại sứ",
        "ambassador","1413880"),
    row("大手","おおて","N3","n|adj-no",
        "công ty lớn | tập đoàn lớn | cổng chính lâu đài",
        "major company | big company | front castle gate | force attacking the front of a castle","1414010"),
    row("大晦日","おおみそか","N3","n",
        "đêm giao thừa | ngày 31 tháng 12",
        "New Year's Eve","1413190"),
    row("大衆","たいしゅう","N3","n|adj-no",
        "đại chúng | quần chúng",
        "general public | the masses","1414050"),
    row("大勢","おおぜい","N3","n|adj-no|adv",
        "đông người | số đông | đám đông",
        "crowd of people | great number of people | in great numbers","1414220"),
    row("大勢","たいせい","N3","n",
        "tình hình chung | xu thế chung | chiều hướng | đa số",
        "general situation | general trend | general tendency | way things are moving | large majority | majority group","1414230"),
    row("大多数","だいたすう","N3","n|adj-no",
        "đại đa số | phần lớn",
        "great majority","1414460"),
    row("大掃除","おおそうじ","N3","n|vs|vt|vi",
        "tổng vệ sinh | dọn dẹp lớn",
        "major cleanup | spring cleaning","1414390"),
    row("大騒ぎ","おおさわぎ","N3","n|vs|vi",
        "ầm ĩ | náo động | hỗn loạn | ồn ào",
        "clamour | clamor | uproar | tumult | furore | furor","1414410"),
    row("大地","だいち","N3","n",
        "đất đai | mặt đất | vùng đất rộng lớn",
        "earth | ground | the solid earth | the (vast) land","1414520"),
    row("大地震","おおじしん","N3","n",
        "trận động đất lớn | đại địa chấn",
        "major earthquake | large earthquake","1414540"),
    row("大声","おおごえ","N3","n|adj-no",
        "giọng to | tiếng to",
        "loud voice","1414300"),
    row("大都市","だいとし","N3","n",
        "đô thị lớn | đại đô thị",
        "metropolis | large city","1414610"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
