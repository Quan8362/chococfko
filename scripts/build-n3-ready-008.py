# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-008.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("家事","かじ","N3","n",
        "việc nhà | công việc nội trợ | chuyện gia đình",
        "housework | domestic chores | family affairs | household matters","1191980"),
    row("家出","いえで","N3","n|vs|vi",
        "bỏ nhà đi | bỏ trốn khỏi nhà | xuất gia",
        "running away from home | elopement | leaving home","1192030"),
    row("家主","やぬし","N3","n",
        "chủ nhà | chủ trọ | chủ hộ",
        "landlord | landlady | house owner | home owner | head of the household","1191990"),
    row("家政婦","かせいふ","N3","n",
        "người giúp việc nhà | osin | quản gia",
        "housekeeper | maid","1192110"),
    row("家臣","かしん","N3","n",
        "gia thần | bề tôi | chư hầu",
        "vassal | retainer","1192080"),
    row("幾多","いくた","N3","adj-no|adv",
        "nhiều | vô số | rất nhiều",
        "many | numerous","1220040"),
    row("幾分","いくぶん","N3","adv|n",
        "phần nào | ít nhiều | đôi chút",
        "somewhat | to some extent | to some degree | some | part | portion","1220060"),
    row("机上","きじょう","N3","n",
        "trên bàn | lý thuyết | hàn lâm | trên giấy tờ",
        "on the desk | theoretical | academic | armchair (e.g. plan) | desktop | paper","1220220"),
    row("旗揚げ","はたあげ","N3","n|vs",
        "khởi nghiệp | khai trương | thành lập (doanh nghiệp)",
        "raising an army | raising a banner | launching a new group | launching a business","1220290"),
    row("既に","すでに","N3","adv",
        "đã (làm) | trước đó | rõ ràng là",
        "already | previously | before | undeniably | unmistakably","1220310"),
    row("既婚","きこん","N3","adj-no|n",
        "đã kết hôn | có gia đình",
        "married","1220350"),
    row("既視感","きしかん","N3","n",
        "cảm giác déjà vu | ảo giác đã từng thấy",
        "déjà vu","1220380"),
    row("既製","きせい","N3","adj-no|n",
        "hàng có sẵn | may sẵn | sản xuất sẵn",
        "ready-made | off the shelf","1220420"),
    row("既存","きそん","N3","adj-no|n",
        "hiện có | đang tồn tại | đã có",
        "existing","1220450"),
    row("既定","きてい","N3","adj-no|n",
        "đã được quy định | đã xác định | đã định trước",
        "established | fixed | prearranged | predetermined","1220470"),
    row("期日","きじつ","N3","n",
        "ngày quy định | hạn chót | ngày đến hạn",
        "fixed date | appointed date | set date | deadline | due date","1220610"),
    row("期末","きまつ","N3","n",
        "cuối kỳ | cuối học kỳ",
        "end of term","1220620"),
    row("棄権","きけん","N3","n|vs|vi",
        "bỏ phiếu trắng | không bỏ phiếu | rút lui (khỏi cuộc thi)",
        "abstention (from voting) | renunciation (of a right) | withdrawal (from a contest)","1220670"),
    row("機構","きこう","N3","n",
        "cơ chế | bộ máy | hệ thống | cơ cấu tổ chức",
        "mechanism | machinery | system | structure | organization | framework","1220940"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
