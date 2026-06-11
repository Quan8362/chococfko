# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-032.csv — 12 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-032.csv"
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
    row("成人式","せいじんしき","N4","n",
        "lễ thành nhân | lễ trưởng thành",
        "coming-of-age ceremony",
        "1764080",
        "成人式に出席します。","せいじんしきにしゅっせきします。","Tôi tham dự lễ thành nhân.","I attend the coming-of-age ceremony."),
    row("寝癖","ねぐせ","N4","n",
        "tóc rối khi ngủ dậy | thói quen ngủ",
        "bed hair | hair disarranged during sleep | habit of moving around in one's sleep | sleeping habit",
        "1793060",
        "寝癖がひどいです。","ねぐせがひどいです。","Tóc tôi rối tung khi ngủ dậy.","My bed hair is terrible."),
    row("追い求める","おいもとめる","N4","v1|vt",
        "theo đuổi | tìm kiếm | đuổi theo (mục tiêu)",
        "to pursue",
        "1847460",
        "夢を追い求めます。","ゆめをおいもとめます。","Tôi theo đuổi ước mơ.","I pursue my dream."),
    row("食洗機","しょくせんき","N4","n",
        "máy rửa bát | máy rửa chén",
        "dishwasher | dishwashing machine",
        "2021560",
        "食洗機を使います。","しょくせんきをつかいます。","Tôi dùng máy rửa bát.","I use the dishwasher."),
    row("頑張り屋","がんばりや","N4","n",
        "người kiên trì | người chăm chỉ không bỏ cuộc",
        "hard worker | person who perseveres | person who doesn't give up | eager beaver | bitter-ender",
        "2078910",
        "彼女は頑張り屋です。","かのじょはがんばりやです。","Cô ấy là người kiên trì.","She is a hard worker."),
    row("筋トレ","きんトレ","N4","n",
        "tập luyện cơ bắp | tập tạ | rèn luyện sức mạnh",
        "strength training | resistance training | muscle-building",
        "2112490",
        "毎日筋トレをします。","まいにちきんトレをします。","Tôi tập tạ mỗi ngày.","I do strength training every day."),
    row("端午の節句","たんごのせっく","N4","exp|n",
        "Lễ hội trẻ em trai (5/5) | Tango no Sekku",
        "Boys' Day celebration (May 5)",
        "2138430",
        "端午の節句に鯉のぼりを飾ります。","たんごのせっくにこいのぼりをかざります。","Dịp 5/5 tôi trang trí cờ cá chép.","I decorate carp streamers on Boys' Day."),
    row("腕を組む","うでをくむ","N4","exp|v5m",
        "khoanh tay | bắt tay người khác khi đi | lồng tay vào nhau",
        "to fold one's arms | to link arms with someone",
        "2260360",
        "腕を組んで考えます。","うでをくんでかんがえます。","Tôi khoanh tay suy nghĩ.","I think with my arms folded."),
    row("在庫切れ","ざいこぎれ","N4","adj-no|n",
        "hết hàng | không còn trong kho",
        "(being) out of stock",
        "2260860",
        "在庫切れです。","ざいこぎれです。","Hết hàng rồi.","It is out of stock."),
    row("有酸素運動","ゆうさんそうんどう","N4","n",
        "thể dục nhịp tim | vận động hiếu khí | cardio",
        "aerobic exercise | cardio exercise",
        "2513290",
        "有酸素運動をします。","ゆうさんそうんどうをします。","Tôi tập cardio.","I do aerobic exercise."),
    row("無酸素運動","むさんそうんどう","N4","n",
        "vận động kỵ khí | tập sức mạnh không cardio",
        "anaerobic exercise",
        "2513300",
        "無酸素運動も取り入れます。","むさんそうんどうもとりいれます。","Tôi cũng tập vận động kỵ khí.","I also incorporate anaerobic exercise."),
    row("スポーツジム","スポーツジム","N4","n",
        "phòng tập thể dục | gym thể thao",
        "sports gym | gymnasium",
        "2801310",
        "スポーツジムに通います。","スポーツジムにかよいます。","Tôi đến phòng tập thể dục.","I go to the sports gym."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
