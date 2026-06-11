# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-062.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    # 計器 - 2 parts
    row("計器","けいき","N4","n",
        "đồng hồ đo | thiết bị đo",
        "meter | gauge","1252130"),
    # 計略 - 6 parts
    row("計略","けいりゃく","N4","n",
        "kế hoạch | mưu mô | mưu kế | thủ đoạn | bẫy | âm mưu",
        "plan | scheme | stratagem | trick | trap | plot","1252250"),
    # 警告 - 4 parts
    row("警告","けいこく","N4","n|vs|vt",
        "cảnh báo | cảnh cáo | khuyến cáo | keikoku (hình phạt trong judo)",
        "warning | caution | admonition | keikoku (penalty in judo)","1252360"),
    # 警備 - 5 parts
    row("警備","けいび","N4","n|vs|vt",
        "phòng thủ | bảo vệ | canh gác | cảnh sát | an ninh",
        "defense | defence | guard | policing | security","1252490"),
    # 警報 - 3 parts
    row("警報","けいほう","N4","n",
        "cảnh báo | báo động | tín hiệu cảnh báo",
        "warning | alarm | alert","1252520"),
    # 軽傷 - 1 part
    row("軽傷","けいしょう","N4","n",
        "thương tích nhẹ",
        "minor injury","1252720"),
    # 警察署 - 1 part
    row("警察署","けいさつしょ","N4","n",
        "đồn cảnh sát",
        "police station","1252410"),
    # 警戒 - 5 parts
    row("警戒","けいかい","N4","n|vs|vt",
        "cảnh giác | thận trọng | tỉnh táo | đề phòng | canh phòng",
        "vigilance | caution | alertness | precaution | being on guard","1252310"),
    # 警護 - 2 parts
    row("警護","けいご","N4","n|vs|vt",
        "vệ sĩ | tháp tùng bảo vệ",
        "bodyguard | escort","1252350"),
    # 軽快 - 14 parts
    row("軽快","けいかい","N4","adj-na|n|vs|vi",
        "nhẹ nhàng (trong cử động) | linh hoạt | nhanh nhẹn | bật bẻo | vui vẻ | phấn chấn | tươi tắn | hoạt bát | thoải mái (ví dụ: quần áo) | nhịp điệu (ví dụ: giai điệu) | chuyển biến tốt hơn (bệnh) | thuyên giảm | hồi phục | dưỡng bệnh",
        "light (of movements) | nimble | sprightly | springy | light-hearted | cheerful | buoyant | jaunty | casual (e.g. clothing) | rhythmical (e.g. melody) | taking a turn for the better (of an illness) | receding of symptoms | recovery | convalescence","1252600"),
    # 軽減 - 2 parts
    row("軽減","けいげん","N4","n|vs|vt|vi",
        "giảm bớt | giảm thiểu",
        "abatement | reduction","1252680"),
    # 軽視 - 7 parts
    row("軽視","けいし","N4","n|vs|vt",
        "coi nhẹ | xem thường | khinh thường | hạ thấp | bác bỏ | khinh miệt | khinh bỉ",
        "making light of | thinking little of | slighting | belittling | dismissing | contempt | disdain","1252710"),
    # 軽蔑 - 6 parts
    row("軽蔑","けいべつ","N4","n|vs|vt",
        "khinh miệt | khinh bỉ | coi thường | khinh rẻ | nhìn xuống | xem thường",
        "contempt | scorn | disdain | despising | looking down on | slighting","1252860"),
    # 警察 - 7 parts
    row("警察","けいさつ","N4","n|n-suf",
        "cảnh sát | cảnh sát viên | đồn cảnh sát | người tự phong cảnh sát (về quy tắc, tiêu chuẩn,...) | người hay xen vào | tự vệ dân phố | người kiểm soát",
        "police | police officer | police station | self-appointed enforcer (of a rule, standard, etc.) | busybody | vigilante | gatekeeper","1252390"),
    # 警官 - 3 parts
    row("警官","けいかん","N4","n",
        "cảnh sát viên | cảnh sát | cảnh sát constable",
        "police officer | policeman | constable","1252330"),
    # 軽装 - 4 parts
    row("軽装","けいそう","N4","n|vs|vi",
        "mặc nhẹ nhàng | ăn mặc gọn nhẹ | trang bị nhẹ | vũ trang nhẹ",
        "light clothing | dressing light | light equipment | light armaments","1252800"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
