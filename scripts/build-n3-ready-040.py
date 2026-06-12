# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-040.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("話し合い","はなしあい","N3","n|vs",
        "thảo luận | đàm thoại | hội đàm",
        "discussion | talk | tête-à-tête | conference","1600910"),
    row("反映","はんえい","N3","n|vs|vt|vi",
        "phản chiếu | phản ánh | áp dụng | có hiệu lực",
        "reflection (of light) | reflection (of society, attitudes, etc.) | application (of an update, changes, etc.) | taking effect","1601160"),
    row("反逆","はんぎゃく","N3","n|vs|vi",
        "phản loạn | phản quốc | nổi loạn | khởi nghĩa",
        "treason | treachery | mutiny | rebellion | insurrection","1601180"),
    row("反復","はんぷく","N3","n|vs|vt",
        "lặp lại | nhắc lại | lặp đi lặp lại",
        "repetition | repeat | reiteration | replication | recursion | iteration","1601220"),
    row("暴露","ばくろ","N3","n|vs|vt|vi",
        "tiết lộ | phơi bày | vạch trần",
        "disclosure | exposure | revelation","1601280"),
    row("抜粋","ばっすい","N3","n|vs|vt",
        "trích dẫn | trích đoạn | tuyển chọn",
        "extract | excerpt | selection","1601310"),
    row("控え室","ひかえしつ","N3","n",
        "phòng chờ | phòng đợi | hậu trường",
        "waiting room | anteroom | antechamber | green room","1601430"),
    row("引き金","ひきがね","N3","n",
        "cò súng | cò gà | nguyên nhân trực tiếp | tác nhân",
        "trigger (of a gun, etc.) | trigger (for something) | immediate cause","1601570"),
    row("引き算","ひきざん","N3","n|vs|vt",
        "phép trừ | phép tính trừ",
        "subtraction","1601610"),
    row("引き継ぎ","ひきつぎ","N3","n",
        "bàn giao | chuyển giao | tiếp nhận",
        "taking over | handing over | transfer of control | inheriting | passing on the baton","1601670"),
    row("引き続き","ひきつづき","N3","adv|n",
        "liên tục | tiếp tục | tiếp đó | sau đó",
        "continuously | continually | without a break | next | then | after that","1601690"),
    row("久々","ひさびさ","N3","adj-na|adj-no|adv|n",
        "lâu lắm rồi | đã lâu | sau một thời gian dài",
        "(in a) long time | long time (ago) | while (ago) | long ago | long while (ago)","1601820"),
    row("必死","ひっし","N3","adj-na|adj-no|n",
        "liều lĩnh | tuyệt vọng | điên cuồng | ra sức",
        "frantic | frenetic | desperate | inevitable death","1601890"),
    row("一先ず","ひとまず","N3","adv",
        "trước mắt | tạm thời | ít ra là",
        "for now | for the time being | for the present | though not quite satisfactorily | after a fashion","1601990"),
    row("独り占め","ひとりじめ","N3","n|vs|vt",
        "chiếm hết một mình | độc chiếm | giữ riêng một mình",
        "hogging | having all to oneself | monopolising | monopolizing","1602020"),
    row("一人ぼっち","ひとりぼっち","N3","n|adj-no",
        "cô đơn | một mình | sự cô độc",
        "aloneness | loneliness | solitude","1602040"),
    row("日々","ひび","N3","adj-no|n|adv",
        "hàng ngày | từng ngày | ngày qua ngày",
        "daily | everyday | days (e.g. of one's youth) | every day | day after day | day by day","1602120"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
