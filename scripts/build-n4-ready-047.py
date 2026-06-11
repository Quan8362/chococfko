# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-047.csv -- 12 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-047.csv"
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
    row("釈放","しゃくほう","N4","n|vs|vt",
        "tha bổng | trả tự do | thả ra",
        "release | liberation | acquittal",
        "1324260",
        "容疑者が釈放された。","ようぎしゃがしゃくほうされた。",
        "Nghi phạm được trả tự do.","The suspect was released."),
    row("犯人","はんにん","N4","n",
        "tội phạm | kẻ phạm tội | thủ phạm",
        "offender | criminal | culprit",
        "1481630",
        "犯人を捕まえる。","はんにんをつかまえる。",
        "Bắt thủ phạm.","Catch the criminal."),
    row("昆布","こんぶ","N4","n",
        "rong biển kombu | tảo bẹ Nhật Bản | konbu",
        "kombu (usu. Saccharina japonica) | konbu | kelp | edible kelp",
        "1579150",
        "昆布でだしを取る。","こんぶでだしをとる。",
        "Lấy nước dùng từ rong biển kombu.","Make broth from kombu."),
    row("上映","じょうえい","N4","n|vs|vt",
        "chiếu phim | buổi chiếu | trình chiếu phim",
        "screening (a movie) | showing",
        "1352650",
        "新作映画を上映する。","しんさくえいがをじょうえいする。",
        "Chiếu phim mới.","Screen a new film."),
    row("声優","せいゆう","N4","n",
        "diễn viên lồng tiếng | nghệ sĩ lồng tiếng (radio, hoạt hình)",
        "voice actor or actress (radio, animation, etc.)",
        "1380570",
        "人気の声優。","にんきのせいゆう。",
        "Diễn viên lồng tiếng nổi tiếng.","A popular voice actor."),
    row("浪費","ろうひ","N4","n|vs|vt",
        "lãng phí | phung phí | tiêu xài bừa bãi",
        "waste | extravagance",
        "1560800",
        "時間を浪費する。","じかんをろうひする。",
        "Lãng phí thời gian.","Waste time."),
    row("漫画家","まんがか","N4","n",
        "họa sĩ manga | tác giả truyện tranh | mangaka",
        "cartoonist | comic book artist | manga artist | manga author",
        "1811920",
        "有名な漫画家になる。","ゆうめいなまんがかになる。",
        "Trở thành họa sĩ manga nổi tiếng.","Become a famous manga artist."),
    row("脚本","きゃくほん","N4","n",
        "kịch bản | kịch bản phim | scenario",
        "script | screenplay | scenario",
        "1226880",
        "脚本を書く。","きゃくほんをかく。",
        "Viết kịch bản.","Write a screenplay."),
    row("逮捕","たいほ","N4","n|vs|vt",
        "bắt giữ | bắt bớ | bị bắt",
        "arrest | apprehension | capture",
        "1411470",
        "容疑者を逮捕する。","ようぎしゃをたいほする。",
        "Bắt giữ nghi phạm.","Arrest the suspect."),
    row("酢","す","N4","n",
        "giấm | dấm",
        "vinegar",
        "1370270",
        "酢を加える。","すをくわえる。",
        "Thêm giấm vào.","Add vinegar."),
    row("鰹節","かつおぶし","N4","n",
        "cá ngừ khô bào mỏng (Nhật) | katsuobushi",
        "katsuobushi | pieces of sliced dried bonito | bonito flakes",
        "1208860",
        "鰹節でだしを取る。","かつおぶしでだしをとる。",
        "Lấy nước dùng từ cá ngừ khô.","Make broth from bonito flakes."),
    row("麹","こうじ","N4","n",
        "koji (gạo ủ mốc Nhật) | gạo lên men | men gạo",
        "kōji | malted rice | malt | malt-like material from growing mold on rice",
        "1285730",
        "塩麹を作る。","しおこうじをつくる。",
        "Làm shio-koji (muối koji).","Make salted koji."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
