# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-060.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    # 快感 - 3 parts
    row("快感","かいかん","N4","n",
        "cảm giác dễ chịu | cảm giác thú vị | niềm vui",
        "pleasant feeling | pleasant sensation | pleasure","1200010"),
    # 怪訝 - 5 parts
    row("怪訝","けげん","N4","adj-na",
        "bối rối | ngạc nhiên | khó hiểu | nghi ngờ | đáng ngờ",
        "puzzled | perplexed | quizzical | dubious | suspicious","1200380"),
    # 改革 - 3 parts
    row("改革","かいかく","N4","n|vs|vt",
        "cải cách | cải tổ | tái cơ cấu",
        "reform | reformation | reorganization","1200780"),
    # 改正 - 3 parts
    row("改正","かいせい","N4","n|vs|vt|adj-no",
        "sửa đổi | tu chỉnh | thay đổi",
        "revision | amendment | alteration","1200930"),
    # 改定 - 3 parts
    row("改定","かいてい","N4","n|vs|vt",
        "sửa đổi (quy tắc, giá cả,...) | thay đổi | điều chỉnh",
        "revision (of a rule, price, etc.) | alteration | change","1201040"),
    # 海峡 - 2 parts
    row("海峡","かいきょう","N4","n",
        "eo biển | eo biển (giữa hai khối đất)",
        "channel (e.g. between two land masses) | strait","1201320"),
    # 海上 - 2 parts
    row("海上","かいじょう","N4","n|adj-no",
        "trên biển | mặt biển",
        "(on the) sea | surface of the sea","1201460"),
    # 海草 - 3 parts
    row("海草","かいそう","N4","n",
        "thực vật biển | cỏ biển | rong biển",
        "marine plant | seagrass | seaweed","1201580"),
    # 皆勤 - 1 part
    row("皆勤","かいきん","N4","n|vs|vi",
        "chuyên cần tuyệt đối",
        "perfect attendance","1202210"),
    # 開演 - 2 parts
    row("開演","かいえん","N4","n|vs|vt|vi",
        "kéo màn | bắt đầu (vở kịch, buổi hòa nhạc,...)",
        "curtain raising | starting (e.g. play, concert)","1202530"),
    # 開業 - 2 parts
    row("開業","かいぎょう","N4","n|vs|vt|vi",
        "khai nghiệp | mở phòng khám (doanh nghiệp,...)",
        "opening a business | opening a practice","1202600"),
    # 貝殻 - 2 parts
    row("貝殻","かいがら","N4","n",
        "vỏ sò | vỏ ốc",
        "seashell | shell","1203130"),
    # 契機 - 4 parts
    row("契機","けいき","N4","n",
        "cơ hội | dịp | nguyên nhân | yếu tố kích hoạt",
        "opportunity | chance | trigger | cause","1250180"),
    # 恵み - 2 parts
    row("恵み","めぐみ","N4","n",
        "ơn lành | ân huệ",
        "blessing | grace","1250470"),
    # 敬礼 - 2 parts
    row("敬礼","けいれい","N4","n|vs|vi",
        "chào kính (cử chỉ) | cúi đầu kính chào",
        "salute | bow","1250790"),
    # 景色 - 3 parts
    row("景色","けしき","N4","n",
        "cảnh vật | phong cảnh | cảnh quan",
        "scenery | scene | landscape","1250870"),
    # 懐中電灯 - 2 parts
    row("懐中電灯","かいちゅうでんとう","N4","n",
        "đèn pin | đèn bỏ túi",
        "(electric) torch | flashlight","1200600"),
    # 形見 - 5 parts
    row("形見","かたみ","N4","n",
        "vật kỷ niệm (của người đã mất) | đồ lưu niệm | di vật | kỷ niệm | quà lưu niệm",
        "memento (esp. of a deceased person) | keepsake | heirloom | remembrance | souvenir","1250260"),
    # 携帯 - 3 parts
    row("携帯","けいたい","N4","n|vs|vt",
        "mang theo người | điện thoại di động | điện thoại",
        "carrying (on one's person or in the hand) | mobile phone | cell phone","1250680"),
    # 海豚 - 1 part
    row("海豚","いるか","N4","n",
        "cá heo (và các loài cá voi có răng nhỏ, bao gồm cá heo cảng, cá voi beluga,...)",
        "dolphin (or other small toothed whales, incl. porpoises, belugas, etc.)","1201670"),
    # 海軍 - 2 parts
    row("海軍","かいぐん","N4","n",
        "hải quân | lực lượng hải quân",
        "navy | naval force","1201330"),
    # 皆無 - 5 parts
    row("皆無","かいむ","N4","adj-na|adj-no|n",
        "không tồn tại | không có | không còn gì | hoàn toàn không | tuyệt đối không",
        "nonexistent | nil | none | nothing (at all) | bugger-all","1202240"),
    # 稽古 - 4 parts
    row("稽古","けいこ","N4","n|vs|vt",
        "luyện tập | tập luyện | rèn luyện | học tập",
        "practice | practising | training | study","1250990"),
    # 開催 - 3 parts
    row("開催","かいさい","N4","n|vs|vt",
        "tổ chức (hội nghị, triển lãm,...) | khai mạc | đăng cai (ví dụ: Olympic)",
        "holding (a conference, exhibition, etc.) | opening | hosting (e.g. the Olympics)","1202710"),
    # 開店 - 2 parts
    row("開店","かいてん","N4","n|vs|vt|vi",
        "khai trương cửa hàng | mở cửa hàng (trong ngày)",
        "opening a new shop | opening a shop (for the day)","1202870"),
    # 開放 - 4 parts
    row("開放","かいほう","N4","n|vs|vt",
        "mở (cửa, cửa sổ,...) | để mở | mở cửa (cho công chúng) | cho phép tiếp cận",
        "opening (a door, window, etc.) | leaving open | opening up (e.g. to the public) | allowing (public) access","1202950"),
    # 開発 - 4 parts
    row("開発","かいはつ","N4","n|vs|vt",
        "phát triển | khai hoang | ứng dụng | khai thác (tài nguyên)",
        "development | cultivation | application | exploitation (of resources)","1202880"),
    # 階級 - 3 parts
    row("階級","かいきゅう","N4","n",
        "tầng lớp (xã hội) | cấp bậc | hạng",
        "(social) class | rank | grade","1203040"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
