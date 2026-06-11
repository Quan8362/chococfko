# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-034.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("幸運","こううん","N3","n|adj-na",
        "may mắn | vận may | hạnh phúc",
        "good luck | fortune","1592930"),
    row("広報","こうほう","N3","n|vs|vt",
        "quan hệ công chúng | PR | thông tin công cộng | quảng cáo",
        "public relations | PR | publicity | public information | publicizing","1593040"),
    row("枯渇","こかつ","N3","n|vs|vi",
        "cạn kiệt | khô cạn | hết sạch | bị tiêu hao",
        "drying up | running dry | running out | being exhausted | being drained","1593120"),
    row("強情","ごうじょう","N3","adj-na|n",
        "bướng bỉnh | cứng đầu | cố chấp",
        "obstinate | stubborn | headstrong","1593510"),
    row("逆さま","さかさま","N3","adj-na|adj-no|n",
        "ngược lại | lộn ngược | đảo ngược | đầu trên cổ dưới",
        "inverted | upside down | reversed | back to front | wrong way round","1593650"),
    row("先駆け","さきがけ","N3","n|vs|vi",
        "người tiên phong | người dẫn đầu | tiền phong | mở đường",
        "pioneer | leader | taking the initiative | forerunner | harbinger | herald","1593680"),
    row("差出人","さしだしにん","N3","n",
        "người gửi (thư) | người gởi",
        "sender (e.g. of mail)","1593760"),
    row("差し支え","さしつかえ","N3","n",
        "trở ngại | cản trở | bất tiện",
        "hindrance | impediment","1593780"),
    row("仕上げ","しあげ","N3","n",
        "hoàn thiện | chạm ngõ cuối | kết thúc | đánh bóng",
        "finish | finishing | finishing touches","1594040"),
    row("仕来り","しきたり","N3","n",
        "phong tục | tập quán | truyền thống | tục lệ",
        "custom | convention | tradition | mores | conventional practice","1594160"),
    row("刺激的","しげきてき","N3","adj-na",
        "kích thích | thú vị | gây hứng | khêu gợi",
        "stimulating | exciting | provocative","1594220"),
    row("失神","しっしん","N3","n|vs|vi",
        "ngất xỉu | mất ý thức | xỉu đi",
        "fainting | losing consciousness | passing out | syncope","1594420"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
