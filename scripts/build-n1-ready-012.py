# -*- coding: utf-8 -*-
"""Build N1 ready wave 012 — science/biology/physics terms (set 12)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-012.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("良性","りょうせい","n|adj-no","lành tính | (khối u) lành","benign","1554610"),
    ("悪性","あくせい","adj-no|n","ác tính | (ung thư) ác tính | hiểm nghèo | nguy hiểm","malignant | virulent | pernicious","1152070"),
    ("血栓","けっせん","n","cục máu đông | huyết khối | nghẽn mạch","thrombus | blood clot","1669960"),
    ("摂取","せっしゅ","n|vs|vt","hấp thụ | nạp vào | tiếp thu | tiếp nhận (văn hóa)","intake | ingestion | absorption | assimilation","1385710"),
    ("形質","けいしつ","n","tính trạng | đặc tính di truyền | hình chất","(phenotypic) trait | hereditary character","1820980"),
    ("変異","へんい","n|vs|vi","biến dị | đột biến | biến đổi | dị thường","variation | mutation | unusual occurrence","1510850"),
    ("淘汰","とうた","n|vs|vt","đào thải | sàng lọc | loại bỏ | chọn lọc","weeding out | elimination | culling | selection","1448570"),
    ("交配","こうはい","n|vs|vt","giao phối | lai tạo | thụ phấn chéo","mating | crossbreeding | cross-fertilization","1272490"),
    ("受精","じゅせい","n|vs|vi","thụ tinh | thụ phấn | thụ thai","fertilization | impregnation | pollination","1635910"),
    ("胚","はい","n","phôi | mầm (hạt) | phôi thai","embryo | germ","2060070"),
    ("捕食","ほしょく","n|vs|vt","ăn thịt | săn mồi | bắt mồi","predation | preying upon","1514210"),
    ("群生","ぐんせい","n|vs|vi","mọc thành đám | sống thành bầy | quần cư (sinh vật)","growing en masse | living gregariously","1247560"),
    ("沸騰","ふっとう","n|vs|vi","sôi | sục sôi | dâng cao (tranh luận) | tăng vọt (giá)","boiling | seething | (debate) heating up | soaring","1501720"),
    ("引力","いんりょく","n","lực hấp dẫn | sức hút | lực kéo | sức cuốn hút","attraction | gravitational pull | magnetism","1169720"),
    ("粘性","ねんせい","adj-no|n","độ nhớt | tính dính | tính nhớt","viscous | sticky | viscosity","1469720"),
    ("輻射","ふくしゃ","n|vs|vt","bức xạ | phát xạ","radiation","1573470"),
    ("伝導","でんどう","n|vs|vt|vi","dẫn truyền (nhiệt/điện) | truyền dẫn | dẫn (xung thần kinh)","conduction (heat/electricity) | transmission","1442280"),
    ("絶縁","ぜつえん","n|vs|vi|vt","đoạn tuyệt | cắt đứt quan hệ | cách điện | cách nhiệt","breaking off relations | insulation | isolation","1386760"),
    ("磁場","じば","n","từ trường | trường từ | không khí (nơi tụ điểm)","magnetic field | atmosphere | focal point","1579590"),
    ("電磁場","でんじば","n","trường điện từ | điện từ trường","electromagnetic field","1766070"),
    ("原子核","げんしかく","n","hạt nhân nguyên tử | nhân nguyên tử","nucleus | atomic nucleus","1261600"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
