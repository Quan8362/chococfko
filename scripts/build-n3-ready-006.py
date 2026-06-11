# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-006.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("賛助","さんじょ","N3","n|vs|vt",
        "ủng hộ | bảo trợ",
        "support | patronage","1304190"),
    row("賛歌","さんか","N3","n",
        "bài ca ngợi | bài thánh ca | bài tụng ca | bài ca chúc tụng",
        "song of praise | eulogy | paean | hymn","1304140"),
    row("即物的","そくぶつてき","N3","adj-na",
        "thực tế | không lãng mạn | thực dụng | thực tiễn",
        "practical | matter-of-fact | realistic | utilitarian | pragmatic","1404310"),
    row("つかの間","つかのま","N3","adj-no|n",
        "khoảnh khắc | giây lát | thời gian ngắn",
        "moment | brief space of time","1404490"),
    row("束縛","そくばく","N3","n|vs|vt",
        "sự ràng buộc | hạn chế | xiềng xích | ách",
        "restraint | restriction | fetters | yoke | shackles | binding","1404510"),
    row("測定","そくてい","N3","n|vs|vt",
        "đo lường | phép đo",
        "measurement","1404570"),
    row("測量","そくりょう","N3","n|vs|vt",
        "đo đạc | khảo sát địa lý | trắc địa",
        "measurement | surveying","1404590"),
    row("息吹","いぶき","N3","n",
        "hơi thở | dấu hiệu sức sống | sinh khí | sức sống mới",
        "breath | sign (of something new and fresh) | vitality","1404410"),
    row("息継ぎ","いきつぎ","N3","n|vs|vi",
        "lấy hơi thở | nghỉ ngắn | nghỉ ngơi",
        "taking a breath (while singing, swimming, etc.) | short break | breather","1404380"),
    row("息切れ","いきぎれ","N3","n|vs|vi",
        "hụt hơi | thở hổn hển | kiệt sức | hết hơi",
        "shortness of breath | panting | puffing | running out of steam","1404420"),
    row("息抜き","いきぬき","N3","n|vs|vi",
        "nghỉ ngơi | thư giãn | xả hơi | giải lao",
        "taking a breather | relaxation | rest | vent | ventilation opening","1404430"),
    row("足音","あしおと","N3","n",
        "tiếng bước chân | dấu hiệu tiếp cận",
        "(sound of) footsteps | sense or sign that something is approaching","1404770"),
    row("足腰","あしこし","N3","n",
        "chân và thắt lưng | phần thân dưới | nền tảng",
        "legs and loins | lower body | foundations | underpinnings","1404810"),
    row("足止め","あしどめ","N3","n|vs|vt",
        "giữ lại | giam cầm | bị mắc kẹt | bị cầm chân",
        "preventing (someone) from leaving | confinement | keeping indoors | being stranded","1404820"),
    row("足早","あしばや","N3","adj-na|n",
        "đi nhanh | nhanh nhẹn | bước nhanh | tốc độ nhanh",
        "fast (walking) | quick | brisk | quick (passing of time)","1404880"),
    row("足踏み","あしぶみ","N3","n|vs|vi",
        "dậm chân | giậm chân | đứng yên | dậm chân tại chỗ",
        "stepping (in place) | stamping (up and down) | stomping | marking time | standstill","1404930"),
    row("足並み","あしなみ","N3","n",
        "tốc độ bước chân | bước đi | sự hợp tác nhịp nhàng",
        "pace | step","1404950"),
    row("速やか","すみやか","N3","adj-na",
        "nhanh chóng | kịp thời | mau lẹ | nhanh nhẹn | nhanh",
        "quick | speedy | prompt | rapid | swift","1405000"),
    row("速記","そっき","N3","n|vs|vt",
        "tốc ký | viết tắt | ký hiệu tốc ký",
        "shorthand | stenography","1405010"),
    row("速達","そくたつ","N3","n",
        "thư nhanh | giao hàng nhanh | dịch vụ chuyển phát nhanh",
        "express | special delivery","1405030"),
    row("速報","そくほう","N3","n|vs|vt",
        "tin nhanh | bản tin nhanh | thông báo khẩn",
        "news flash | prompt report | bulletin | quick announcement","1405070"),
    row("俗に","ぞくに","N3","adv",
        "thường gọi là | thông thường | nói theo cách thông thường",
        "commonly (called, said, etc.) | popularly | colloquially | in common parlance","1405120"),
    row("俗称","ぞくしょう","N3","n|vs|vt",
        "tên thông thường | tên phổ thông | tên tục",
        "common name | popular name | secular name (of a Buddhist monk)","1405430"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
