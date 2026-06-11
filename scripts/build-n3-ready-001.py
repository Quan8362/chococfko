# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-001.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    # 可能 - 4 parts
    row("可能","かのう","N3","adj-na|n",
        "có thể | tiềm năng | khả thi | thực hiện được",
        "possible | potential | practicable | feasible","1191060"),
    # 確実 - 8 parts
    row("確実","かくじつ","N3","adj-na|n",
        "chắc chắn | chắc | xác định | đáng tin cậy | vững chắc | kiên cố | an toàn | đảm bảo",
        "certain | sure | definite | reliable | sound | solid | safe | secure","1205830"),
    # 実現 - 7 parts
    row("実現","じつげん","N3","n|vs|vt|vi",
        "thực hiện (ví dụ: hệ thống) | hiện thực hóa | hiện thực hóa | thực hiện | thực hiện | hiện thực | hiện thực",
        "implementation (e.g. of a system) | materialization | materialisation | realization | realisation | actualization | actualisation","1321020"),
    # 尊重 - 3 parts
    row("尊重","そんちょう","N3","n|vs|vt",
        "tôn trọng | kính trọng | trân trọng",
        "respect | esteem | regard","1406460"),
    # 達成 - 4 parts
    row("達成","たっせい","N3","n|vs|vt",
        "thành tích | đạt được | hoàn thành | hiện thực hóa",
        "achievement | attainment | accomplishment | realization","1416260"),
    # 一般的 - 4 parts
    row("一般的","いっぱんてき","N3","adj-na",
        "chung | phổ biến | thông thường | điển hình",
        "general | popular | common | typical","1165880"),
    # 判断 - 7 parts
    row("判断","はんだん","N3","n|vs|vt",
        "phán xét | phán đoán | quyết định | kết luận | phán quyết | bói toán | xét xử",
        "judgment | judgement | decision | conclusion | adjudication | divination | judgement","1478620"),
    # 向上 - 5 parts
    row("向上","こうじょう","N3","n|vs|vi",
        "nâng cao | tăng lên | cải thiện | tiến bộ | phát triển",
        "elevation | rise | improvement | advancement | progress","1277250"),
    # 場面 - 8 parts
    row("場面","ばめん","N3","n",
        "cảnh (tình huống) | bối cảnh | nơi (xảy ra sự kiện) | kịch bản | trường hợp | cảnh (trong phim, kịch) | cú đúp | trạng thái thị trường",
        "scene | setting | place (where something happens) | scenario | case | scene (in a movie, play) | shot | state of the market","1355910"),
    # 実施 - 7 parts
    row("実施","じっし","N3","n|vs|vt",
        "thi hành | triển khai | đưa vào thực tiễn | thực hiện | vận hành | tham số vận hành | ban hành",
        "enforcement | implementation | putting into practice | carrying out | operation | working (e.g. working parameters) | enactment","1321140"),
    # 対策 - 7 parts
    row("対策","たいさく","N3","n",
        "biện pháp | bước đi | biện pháp đối phó | kế hoạch đối phó | hành động đối phó | chiến lược | chuẩn bị (ví dụ: ôn thi)",
        "measure | step | countermeasure | counterplan | countermove | strategy | preparation (e.g. for a test)","1410050"),
    # 提案 - 3 parts
    row("提案","ていあん","N3","n|vs|vt",
        "đề xuất | đề nghị | gợi ý",
        "proposal | proposition | suggestion","1436320"),
    # 様々 - 4 parts
    row("様々","さまざま","N3","adj-na|n",
        "đa dạng | phong phú | khác nhau | đủ mọi loại",
        "various | varied | diverse | all sorts of","1593830"),
    # 表現 - 4 parts
    row("表現","ひょうげん","N3","n|vs|vt",
        "biểu đạt | biểu hiện | mô tả | đại diện (của nhóm)",
        "expression | representation | description | representation (of a group)","1489510"),
    # 誤解 - 1 part
    row("誤解","ごかい","N3","n|vs|vt|vi",
        "hiểu lầm",
        "misunderstanding","1271310"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
