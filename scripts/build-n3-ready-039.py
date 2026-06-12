# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-039.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("内情","ないじょう","N3","n",
        "tình trạng nội bộ | thực trạng bên trong",
        "internal conditions | true state of affairs","1599370"),
    row("中身","なかみ","N3","n",
        "nội dung | bên trong | chất lượng thực chất",
        "contents | interior | filling | substance | content | (sword) blade","1599430"),
    row("謎々","なぞなぞ","N3","n",
        "câu đố | bí ẩn | trò đoán chữ",
        "riddle | puzzle | enigma","1599500"),
    row("何となく","なんとなく","N3","adv",
        "không biết tại sao | một cách nào đó | không rõ lý do",
        "somehow | for some reason (or other) | without knowing why","1599730"),
    row("担う","になう","N3","v5u|vt",
        "gánh chịu | đảm nhận | gánh vác | chịu trách nhiệm",
        "to carry on one's shoulder | to shoulder | to bear | to bear (a burden, responsibility, etc.) | to take upon oneself","1599900"),
    row("にわか雨","にわかあめ","N3","n",
        "cơn mưa chợt | mưa rào | mưa đột ngột",
        "rain shower","1599930"),
    row("値上げ","ねあげ","N3","n|vs|vt",
        "tăng giá | nâng giá",
        "price increase | rise in price | wage increase","1600030"),
    row("呑気","のんき","N3","adj-na|n",
        "thoải mái | vô lo | hồn nhiên | dễ tính",
        "easy | easygoing | carefree | happy-go-lucky | optimistic | leisurely | careless | thoughtless","1600560"),
    row("育む","はぐくむ","N3","v5m|vt",
        "nuôi dưỡng | bồi đắp | vun trồng | ươm mầm",
        "to raise | to bring up | to rear | to cultivate | to foster | to nurture","1600700"),
    row("果たして","はたして","N3","adv",
        "đúng như dự đoán | quả thật | rốt cuộc | thực sự",
        "as was expected | just as one thought | sure enough | really | actually | ever","1600780"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
