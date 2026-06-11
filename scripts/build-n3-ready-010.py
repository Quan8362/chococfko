# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-010.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("芸名","げいめい","N3","n",
        "nghệ danh | tên biểu diễn | tên nghệ sĩ",
        "stage name | pseudonym","1253170"),
    row("芸能界","げいのうかい","N3","n",
        "làng giải trí | thế giới showbiz | giới nghệ thuật",
        "show business | entertainment industry | world of entertainment","1253140"),
    row("激化","げきか","N3","n|vs|vi",
        "leo thang | trở nên dữ dội | tăng cường độ",
        "intensification | aggravation","1253640"),
    row("献身","けんしん","N3","n|vs|vi",
        "cống hiến | hy sinh | tận tụy",
        "devotion | dedication | self-sacrifice","1258450"),
    row("見識","けんしき","N3","n",
        "nhận thức | kiến thức | phán đoán | tự trọng",
        "views | opinion | discernment | pride | self-respect","1259630"),
    row("見地","けんち","N3","n",
        "quan điểm | góc nhìn | lập trường",
        "point of view | viewpoint | standpoint","1259870"),
    row("見張る","みはる","N3","v5r|vi|vt",
        "canh gác | trông chừng | mở to mắt (ngạc nhiên)",
        "to stand watch | to stand guard | to look out | to open (one's eyes) wide","1259880"),
    row("見直し","みなおし","N3","n|vs",
        "xem xét lại | sửa đổi | đánh giá lại",
        "review | reconsideration | revision","1259890"),
    row("見抜く","みぬく","N3","v5k|vt",
        "nhìn thấu | nhận ra (âm mưu) | thấu hiểu",
        "to see through | to see into (someone's heart, mind, etc.) | to perceive","1259980"),
    row("見分ける","みわける","N3","v1|vt",
        "phân biệt | nhận ra | nhận biết",
        "to distinguish | to recognize | to recognise | to tell apart","1260020"),
    row("減少","げんしょう","N3","n|vs|vi",
        "giảm | suy giảm | giảm bớt",
        "decrease | reduction | decline","1263210"),
    row("減速","げんそく","N3","n|vs|vi",
        "giảm tốc | giảm tốc độ",
        "deceleration | slowing down","1263270"),
    row("言語","げんご","N3","n",
        "ngôn ngữ",
        "language","1264420"),
    row("言動","げんどう","N3","n",
        "lời nói và hành động | ngôn hành",
        "speech and conduct | words and actions | words and deeds | behavior and speech","1264520"),
    row("言論","げんろん","N3","n",
        "ngôn luận | diễn đạt quan điểm | tự do ngôn luận",
        "(one's) speech | expression of views | discussion","1264580"),
    row("諺","ことわざ","N3","n",
        "tục ngữ | thành ngữ | cách ngôn | câu châm ngôn",
        "proverb | saying | aphorism | maxim","1264600"),
    row("限定","げんてい","N3","n|vs|vt",
        "giới hạn | hạn chế | phiên bản giới hạn",
        "limit | restriction","1264670"),
    row("限度","げんど","N3","n",
        "giới hạn | hạn mức | mức tối đa",
        "limit | bounds","1264690"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
