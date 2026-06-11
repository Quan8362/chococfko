# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-029.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("和太鼓","わだいこ","N3","n",
        "trống Nhật Bản",
        "Japanese drum","1585340"),
    row("歪む","ゆがむ","N3","v5m|vi",
        "bị cong vênh | bị biến dạng | bị lệch | bị méo | bị bóp méo",
        "to warp | to bend | to contort | to be perverted | to be warped (of a view, mind, etc.) | to be distorted","1585360"),
    row("歪む","ひずむ","N3","v5m|vi",
        "bị cong | bị căng | bị biến dạng | bị vặn vẹo",
        "to warp | to become strained | to become distorted | to become crooked","2846709"),
    row("合鍵","あいかぎ","N3","n",
        "chìa khóa dự phòng | chìa khóa mẫu | chìa vạn năng",
        "duplicate key | master key | passkey | skeleton key","1586030"),
    row("合言葉","あいことば","N3","n",
        "mật khẩu | khẩu hiệu | câu slogan | phương châm",
        "password | watchword | motto | slogan","1586060"),
    row("相性","あいしょう","N3","n",
        "sự tương hợp | sự hòa hợp | hóa học (giữa hai người)",
        "affinity | compatibility | chemistry (between people)","1586070"),
    row("秋晴れ","あきばれ","N3","n",
        "trời thu trong xanh | thời tiết thu đẹp",
        "clear autumnal weather","1586230"),
    row("挙句","あげく","N3","adv|n",
        "sau khi | cuối cùng | rốt cuộc | sau một quá trình dài",
        "after (a long process) | at the end of | last line (of a renga)","1586290"),
    row("足元","あしもと","N3","n|adj-no",
        "dưới chân | bước chân | tại chỗ đứng | gần đây | hiện tại",
        "at one's feet | underfoot | one's step (as in \"watch your step\") | gait | pace | step","1586390"),
    row("あだ名","あだな","N3","n|vs|vt",
        "biệt danh | tên hiệu",
        "nickname","1586450"),
    row("宛先","あてさき","N3","n",
        "địa chỉ | điểm đến | nơi gửi",
        "address | destination","1586500"),
    row("宛名","あてな","N3","n",
        "tên và địa chỉ | tên người nhận | địa chỉ (trên phong bì)",
        "name and address (on an envelope, etc.) | (addressee's) name | addressee","1586520"),
    row("当てはめる","あてはめる","N3","v1|vt",
        "áp dụng | thích nghi | vận dụng",
        "to apply | to adapt","1586530"),
    row("編み物","あみもの","N3","n|adj-no",
        "đan len | hàng dệt kim | đan móc",
        "knitting | knitted material | crochet","1586670"),
    row("雨上がり","あめあがり","N3","n",
        "sau cơn mưa | trời vừa tạnh mưa",
        "after the rain","1586680"),
    row("荒々しい","あらあらしい","N3","adj-i",
        "thô bạo | hung hãn | dữ tợn | khắc nghiệt | thô lỗ",
        "rough | wild | rude | harsh | gruff | violent","1586740"),
    row("あり方","ありかた","N3","n",
        "cách thức nên có | trạng thái hiện tại | cách mọi thứ vận hành",
        "the way (something) ought to be | (present) state (of) | how things are","1586810"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
