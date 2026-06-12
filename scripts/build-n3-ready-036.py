# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-036.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 13 persistent ghosts (1708890,2867035,2860958,2703560,2752960,2845086,2657290,2844618,2120840,2828178,2834858,2772160,2855262)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("全て","すべて","N3","n|adj-no|adv",
        "tất cả | mọi thứ | toàn bộ | hoàn toàn",
        "everything | all | the whole | entirely | completely | wholly | all","1595730"),
    row("住まい","すまい","N3","n|n-suf",
        "nơi ở | nhà cửa | chỗ cư trú",
        "dwelling | house | residence | address | living | life","1595750"),
    row("図々しい","ずうずうしい","N3","adj-i",
        "trơ tráo | vô liêm sỉ | mặt dày | láo lếu",
        "impudent | shameless | brazen | forward | audacious | cheeky","1595940"),
    row("制御","せいぎょ","N3","n|vs|vt",
        "điều khiển | kiểm soát | quản lý | kiềm chế",
        "control (of a machine, device, etc.) | control (over an opponent, one's emotions, etc.) | governing | management | suppression | keeping in check","1595970"),
    row("先頭","せんとう","N3","n",
        "đầu hàng | vị trí dẫn đầu | tiên phong | mũi nhọn",
        "head (of a line, group, etc.) | front | lead | forefront | vanguard","1596210"),
    row("専用","せんよう","N3","n|vs|vt|n-suf|adj-no",
        "dành riêng | dùng riêng | độc quyền | chuyên dụng",
        "(one's) exclusive use | private use | personal use | dedicated use | use for a particular purpose","1596240"),
    row("税込み","ぜいこみ","N3","adj-no|n",
        "đã bao gồm thuế | giá đã tính thuế",
        "including tax (of a price) | pretax (income or profits) | before tax","1596250"),
    row("相互","そうご","N3","n|adj-no",
        "tương hỗ | lẫn nhau | đôi bên",
        "mutual | reciprocal","1596370"),
    row("騒々しい","そうぞうしい","N3","adj-i",
        "ồn ào | náo nhiệt | hỗn loạn | ầm ĩ",
        "noisy | loud | boisterous | clamorous | raucous | turbulent | unsettled | restless","1596440"),
    row("聡明","そうめい","N3","adj-na|n",
        "thông minh | sáng suốt | khôn ngoan | mẫn tuệ",
        "wise | sagacious | intelligent | sensible","1596470"),
    row("素っ気ない","そっけない","N3","adj-i",
        "lạnh lùng | cộc lốc | thờ ơ | ngắn gọn",
        "cold | short | curt | blunt","1596550"),
    row("率直","そっちょく","N3","adj-na|n",
        "thẳng thắn | thành thật | chân thật | nói thẳng",
        "frank | candid | straightforward | openhearted | direct | outspoken","1596570"),
    row("卒倒","そっとう","N3","n|vs|vi",
        "ngất xỉu | bất tỉnh | xỉu",
        "fainting | swooning","1596580"),
    row("備わる","そなわる","N3","v5r|vi",
        "được trang bị | có sẵn | được phú cho | được ban cho",
        "to be furnished with | to be provided with | to be equipped with | to be possessed of | to be endowed with | to be gifted with","1596640"),
    row("算盤","そろばん","N3","n",
        "bàn tính | soroban | tính toán lợi nhuận",
        "abacus | soroban | calculation (esp. of profit and loss) | reckoning","1596700"),
    row("続々","ぞくぞく","N3","adv|adv-to",
        "liên tiếp | nối tiếp nhau | lần lượt",
        "successively | one after another","1596730"),
    row("体当たり","たいあたり","N3","n|vs|vi",
        "lao vào | xông vào | đâm thẳng vào | dồn hết sức lực",
        "ramming attack | hurling oneself (at) | throwing oneself into (e.g. a role) | going all out","1596740"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
