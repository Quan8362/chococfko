# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-051.csv -- 12 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-051.csv"
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
    row("真っ白","まっしろ","N4","adj-na|n",
        "trắng tinh | trắng toát | trắng bóc | trang giấy trắng",
        "pure white | blank (e.g. mind, paper)",
        "1580620",
        "真っ白な雪。","まっしろなゆき。",
        "Tuyết trắng tinh.","Pure white snow."),
    row("真っ青","まっさお","N4","adj-na|n",
        "xanh thẫm | xanh rực | tái nhợt | mặt tái lại",
        "deep blue | bright blue | ghastly pale | pallid | white as a sheet",
        "1604080",
        "顔が真っ青だ。","かおがまっさおだ。",
        "Mặt xanh lét.","One's face has gone pale."),
    row("思いがけない","おもいがけない","N4","adj-i",
        "bất ngờ | ngoài mong đợi | không ngờ tới | tình cờ",
        "unexpected | contrary to expectations | by chance | casual",
        "1610630",
        "思いがけない再会。","おもいがけないさいかい。",
        "Cuộc gặp lại bất ngờ.","An unexpected reunion."),
    row("夕空","ゆうぞら","N4","n",
        "bầu trời chiều | trời lúc hoàng hôn",
        "evening sky | twilight sky",
        "2013460",
        "夕空が赤く染まる。","ゆうぞらがあかくそまる。",
        "Bầu trời chiều nhuốm màu đỏ.","The evening sky turns red."),
    row("夜空","よぞら","N4","n",
        "bầu trời đêm | bầu trời ban đêm",
        "night sky",
        "1536670",
        "夜空の星。","よぞらのほし。",
        "Những ngôi sao trên bầu trời đêm.","Stars in the night sky."),
    row("心遣い","こころづかい","N4","n",
        "sự quan tâm | lòng tốt | sự chu đáo | sự chăm sóc",
        "consideration (for) | thoughtfulness | solicitude | care",
        "1360660",
        "心遣いに感謝する。","こころづかいにかんしゃする。",
        "Cảm ơn vì sự quan tâm chu đáo.","Thank you for your thoughtfulness."),
    row("快晴","かいせい","N4","n",
        "trời quang đãng | trời trong sáng | thời tiết đẹp",
        "clear weather | cloudless weather | good weather",
        "1200060",
        "今日は快晴だ。","きょうはかいせいだ。",
        "Hôm nay trời quang đãng.","Today is clear weather."),
    row("曇り空","くもりぞら","N4","n",
        "bầu trời nhiều mây | trời u ám | trời đầy mây",
        "cloudy sky | overcast sky",
        "1872560",
        "曇り空が続く。","くもりぞらがつづく。",
        "Trời u ám liên tục.","Cloudy skies continue."),
    row("真っ暗","まっくら","N4","adj-na|n",
        "tối đen như mực | tối tăm hoàn toàn | tiền đồ mù mịt",
        "pitch-dark | pitch-black | completely dark | very bleak (future)",
        "1363190",
        "停電で真っ暗だ。","ていでんでまっくらだ。",
        "Mất điện tối đen như mực.","It's pitch-dark due to a power outage."),
    row("真っ赤","まっか","N4","adj-na|n",
        "đỏ rực | đỏ thẫm | đỏ ửng (mặt) | hoàn toàn",
        "bright red | deep red | flushed (of face) | downright (e.g. lie) | complete",
        "1363250",
        "真っ赤な嘘。","まっかなうそ。",
        "Nói dối hoàn toàn.","A downright lie."),
    row("真っ黒","まっくろ","N4","adj-na|n",
        "đen tuyền | đen như mực | đen sẫm",
        "pitch black | jet black | sooty",
        "1604050",
        "真っ黒に焼けた肌。","まっくろにやけたはだ。",
        "Da cháy nắng đen sẫm.","Skin tanned jet black."),
    row("空模様","そらもよう","N4","n",
        "quang cảnh bầu trời | tình hình thời tiết | diễn biến tình hình",
        "look of the sky (esp. of bad weather) | weather | course (of events)",
        "1246050",
        "空模様が怪しい。","そらもようがあやしい。",
        "Trời có vẻ không ổn.","The sky looks threatening."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
