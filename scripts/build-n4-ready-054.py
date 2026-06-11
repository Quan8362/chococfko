# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-054.csv -- 9 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-054.csv"
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
    row("怒鳴る","どなる","N4","v5r|vi",
        "la hét (tức giận) | hét lên",
        "to shout (in anger) | to yell",
        "1445740",
        "怒鳴らないで。","どならないで。",
        "Đừng hét lên.","Don't shout."),
    row("お世話","おせわ","N4","n|vs|vt",
        "sự giúp đỡ | hỗ trợ | trợ giúp",
        "help | aid | assistance",
        "2144410",
        "お世話になりました。","おせわになりました。",
        "Cảm ơn sự giúp đỡ của bạn.","Thank you for your help."),
    row("お礼","おれい","N4","n",
        "lời cảm ơn | lòng biết ơn | lễ phép | lễ nghĩa | cúi chào | phần thưởng | quà tặng | buổi lễ | nghi lễ",
        "thanks | gratitude | manners | etiquette | bow | reward | gift | ceremony | ritual",
        "1270810",
        "お礼を言う。","おれいをいう。",
        "Nói lời cảm ơn.","Say one's thanks."),
    row("くっきり","くっきり","N4","adv|adv-to|vs",
        "rõ ràng (nổi bật) | rõ nét | sắc nét | đậm | nổi bật",
        "clearly (standing out) | distinctly | sharply | boldly | in sharp relief",
        "1003840",
        "くっきりと見える。","くっきりとみえる。",
        "Thấy rõ nét.","Can be seen clearly."),
    row("すっきり","すっきり","N4","adv|adv-to|vs",
        "tươi mát | nhẹ nhõm | dễ chịu | trút gánh nặng | gọn gàng | ngăn nắp | tinh tế | sạch sẽ | không rắc rối | rõ ràng | đơn giản | phân biệt rõ | hoàn toàn | triệt để | không chút nào (câu phủ định) | không dù chút xíu",
        "refreshingly | with a feeling of relief | pleasantly | (a weight) off one's shoulder | shapely | neatly | refinedly | cleanly | without trouble | clearly | plainly | distinctly | completely | thoroughly | not at all (with negative sentence) | not even slightly",
        "1006120",
        "すっきりした気分。","すっきりしたきぶん。",
        "Cảm giác nhẹ nhõm.","A feeling of relief."),
    row("ぴったり","ぴったり","N4","adv|adv-to|vs|adj-na",
        "chặt chẽ | sát | chính xác | đúng | đột ngột (dừng lại) | hoàn toàn phù hợp | lý tưởng",
        "tightly | closely | exactly | precisely | suddenly (stopping) | perfectly (suited) | ideally",
        "1010900",
        "ぴったり合う。","ぴったりあう。",
        "Vừa khít.","Fit perfectly."),
    row("ぼんやり","ぼんやり","N4","adv|adv-to|vs|n",
        "lờ mờ | mờ nhạt | không rõ nét | mơ hồ | lơ đãng | thẫn thờ | cẩu thả | lười biếng | lang thang vô định | mất tập trung | kẻ ngốc | đầu óc rỗng | đần độn",
        "dimly | faintly | indistinctly | vaguely | absentmindedly | vacantly | carelessly | idly | aimlessly | absence of mind | fool | blockhead | dunce",
        "1011920",
        "ぼんやりしている。","ぼんやりしている。",
        "Đang lơ đãng.","Spacing out."),
    row("思い切る","おもいきる","N4","v5r|vt|vi",
        "từ bỏ (mọi suy nghĩ về) | bỏ hẳn | tuyệt vọng về | quyết tâm | đưa ra quyết định | quyết định",
        "to give up (all thoughts of) | to abandon | to despair of | to make up one's mind | to make a decision | to decide",
        "1309320",
        "思い切って挑戦する。","おもいきってちょうせんする。",
        "Quyết tâm thử thách.","Boldly take on a challenge."),
    row("挨拶","あいさつ","N4","n|vs|vi|exp",
        "lời chào | lời chào hỏi | câu chào | chào | câu nói lịch sự khi gặp/chia tay | bài phát biểu (chúc mừng/cảm ơn) | diễn văn | trả lời | phản hồi | thăm xã giao (viếng/chúc mừng/giới thiệu) | trả thù | trả đũa | câu nói hay đấy | đối thoại (giữa thiền nhân để thử giác ngộ) | mối quan hệ | liên kết | can thiệp | hòa giải | người hòa giải",
        "greeting | greetings | salutation | salute | polite set phrase used when meeting or parting from someone | speech (congratulatory or appreciative) | address | reply | response | courtesy visit (to offer condolences, say congratulations, pay respect, introduce oneself, etc.) | revenge | retaliation | a fine thing to say | dialoging (with another Zen practitioner to ascertain their level of enlightenment) | relationship (between people) | connection | intervention | mediation | mediator",
        "1151120",
        "挨拶をする。","あいさつをする。",
        "Chào hỏi.","Give a greeting."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
