# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-059.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    # 快適 - 3 parts
    row("快適","かいてき","N4","adj-na|n",
        "dễ chịu | thoải mái | tiện nghi",
        "pleasant | agreeable | comfortable","1200120"),
    # 快眠 - 3 parts
    row("快眠","かいみん","N4","n|vs|vi",
        "giấc ngủ ngon | giấc ngủ tốt | ngủ ngon giấc",
        "pleasant sleep | good sleep | sleeping well","1200170"),
    # 悔やむ - 5 parts
    row("悔やむ","くやむ","N4","v5m|vt",
        "than thở | than vãn | tiếc nuối | hối hận | ăn năn",
        "to mourn | to lament | to be sorry | to regret | to repent","1200450"),
    # 改善 - 3 parts
    row("改善","かいぜん","N4","n|vs|vt|vi",
        "cải thiện | cải tiến | kaizen (triết lý kinh doanh cải tiến liên tục của Nhật Bản)",
        "betterment | improvement | kaizen (Japanese business philosophy of continuous improvement)","1200960"),
    # 改良 - 2 parts
    row("改良","かいりょう","N4","n|vs|vt",
        "cải tiến | cải cách",
        "improvement | reform","1201140"),
    # 海苔 - 3 parts
    row("海苔","のり","N4","n",
        "rong biển nori | rong biển laver | rong biển ăn được, thường sấy khô và ép thành tấm",
        "nori | laver | edible seaweed, usu. Porphyra yezoensis or P. tenera, usu. dried and pressed into sheets","1201620"),
    # 灰皿 - 1 part
    row("灰皿","はいざら","N4","n",
        "gạt tàn thuốc",
        "ashtray","1201940"),
    # 皆様 - 1 part
    row("皆様","みなさま","N4","n",
        "mọi người (kính ngữ)",
        "everyone","1202260"),
    # 絵本 - 1 part
    row("絵本","えほん","N4","n",
        "sách tranh",
        "picture book","1202380"),
    # 蟹 - 1 part
    row("蟹","かに","N4","n",
        "con cua",
        "crab","1202410"),
    # 辛子 - 1 part
    row("辛子","からし","N4","n",
        "mù tạt",
        "mustard","1202390"),
    # 快調 - 4 parts
    row("快調","かいちょう","N4","adj-na|adj-no|n",
        "tình trạng tốt | thuận lợi | ổn định | trôi chảy",
        "good (condition) | going well | fine | smooth","1200110"),
    # 快速 - 4 parts
    row("快速","かいそく","N4","n|adj-no",
        "tốc độ cao | nhanh chóng | tàu nhanh (chậm hơn tàu tốc hành) | tàu nhanh",
        "high speed | rapidity | rapid-service train (not as fast as express) | rapid train","1200080"),
    # 怪力 - 1 part
    row("怪力","かいりき","N4","n",
        "sức mạnh phi thường",
        "superhuman strength","1200360"),
    # 怪獣 - 1 part
    row("怪獣","かいじゅう","N4","n",
        "quái vật",
        "monster","1200280"),
    # 怪談 - 2 parts
    row("怪談","かいだん","N4","n",
        "chuyện ma | câu chuyện siêu nhiên",
        "ghost story | tale of the supernatural","1200310"),
    # 悔い - 2 parts
    row("悔い","くい","N4","n",
        "hối tiếc | ăn năn",
        "regret | repentance","1200390"),
    # 悔しさ - 6 parts
    row("悔しさ","くやしさ","N4","n",
        "tức tối | cay đắng | thất vọng | bực bội | xấu hổ | hối tiếc",
        "chagrin | bitterness | frustration | vexation | mortification | regret","1200420"),
    # 懐く - 6 parts
    row("懐く","なつく","N4","v5k|vi",
        "trở nên gắn bó (với) | thích (ai) | trở nên thân thiết (với) | được thuần hóa | đến gần (về mặt tình cảm) | trở nên thân mật (với)",
        "to become attached (to) | to take (to) | to become affectionate (with) | to be tamed | to get close (e.g. to someone emotionally) | to become intimate (with)","1200510"),
    # 改まる - 10 parts
    row("改まる","あらたまる","N4","v5r|vi",
        "được đổi mới | thay đổi | được cải thiện | được cải cách | được sửa đổi | được chỉnh sửa | giữ lễ nghi | trở nên trang trọng | trở nặng hơn (bệnh) | trở nên nghiêm trọng",
        "to be renewed | to change | to be improved | to be reformed | to be revised | to be corrected | to stand on ceremony | to be formal | to take a turn for the worse (of an illness) | to take a serious turn","1200730"),
    # 改める - 13 parts
    row("改める","あらためる","N4","v1|vt",
        "thay đổi | biến đổi | sửa đổi | thay thế | cải cách | chỉnh sửa | sửa chữa | cải thiện | kiểm tra | xem xét | kiểm duyệt | làm đúng đắn | làm trang trọng",
        "to change | to alter | to revise | to replace | to reform | to correct | to mend | to improve | to examine | to check | to inspect | to do properly | to do formally","1200750"),
    # 改心 - 3 parts
    row("改心","かいしん","N4","n|vs|vi",
        "cải tà quy chính | sửa đổi bản thân | làm lại cuộc đời",
        "reforming (oneself) | mending one's ways | turning over a new leaf","1200900"),
    # 改装 - 4 parts
    row("改装","かいそう","N4","n|vs|vt|adj-no",
        "cải tạo | tu sửa | tái tổ chức | tái cơ cấu",
        "remodelling | remodeling | reorganization | reorganisation","1200990"),
    # 海水 - 2 parts
    row("海水","かいすい","N4","n",
        "nước biển | nước mặn",
        "seawater | saltwater","1201490"),
    # 海水浴 - 4 parts
    row("海水浴","かいすいよく","N4","n",
        "bơi ở biển | tắm biển | tắm nước mặn | đi tắm biển",
        "swimming in the ocean | sea bathing | seawater bath | going for a dip in the ocean","1201520"),
    # 海賊 - 1 part
    row("海賊","かいぞく","N4","n",
        "cướp biển",
        "pirate","1201600"),
    # 海辺 - 4 parts
    row("海辺","うみべ","N4","n|adj-no",
        "bãi biển | bờ biển | ven biển | duyên hải",
        "beach | seashore | seaside | coast","1201750"),
    # 絵の具 - 4 parts
    row("絵の具","えのぐ","N4","exp|n",
        "màu vẽ | vật liệu tô màu | màu sắc | màu",
        "paint | coloring materials | colors | colours","1202290"),
    # 開花 - 8 parts
    row("開花","かいか","N4","n|vs|vi",
        "nở hoa | nở rộ | bung nở | đâm hoa | khai hoa (của nền văn minh, tài năng,...) | bùng nở | nở rộ | kết quả (của nỗ lực)",
        "flowering | blooming | blossoming | coming into bloom | flowering (of a civilization, talent, etc.) | blossoming | blooming | bearing fruit (of efforts)","1202550"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
