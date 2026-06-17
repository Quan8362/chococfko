# -*- coding: utf-8 -*-
"""Build N1 ready wave 093 — final words to reach 5000+ (set 93)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-093.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("六合","りくごう","n","lục hợp | càn khôn | vũ trụ bốn phương trên dưới | thiên hạ","the universe | the cosmos","1561340"),
    ("驢馬","ろば","n","con lừa | lừa | con la","a donkey | an ass","1574640"),
    ("炉端","ろばた","n","bên bếp lửa | cạnh lò sưởi | quanh bếp ấm (炉端焼き)","the fireside | the hearth","1560010"),
    ("狼藉者","ろうぜきもの","n","kẻ gây rối | tên côn đồ | kẻ càn quấy | quân phá phách","a rioter | a ruffian","1560980"),
    ("朧月","おぼろづき","n","trăng mờ | vầng trăng mờ ảo (đêm xuân) | trăng lu","a hazy moon (esp. on a spring night)","1823750"),
    ("聾唖","ろうあ","n|adj-no","câm điếc | tình trạng vừa điếc vừa câm | người câm điếc","deafness | deaf-mutism","1561170"),
    ("和漢","わかん","n","Nhật và Hán | Nhật Bản và Trung Hoa | văn hóa Nhật-Hán (和漢混淆)","Japanese and Chinese","1666650"),
    ("矮鶏","チャボ","n","gà tre | gà chọi cảnh nhỏ | gà bantam Nhật","a (Japanese) bantam","1569980"),
    ("詫び言","わびごと","n","lời xin lỗi | lời tạ lỗi | lời tạ tội | lời chịu lỗi","an apology","1562680"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
