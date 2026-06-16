# -*- coding: utf-8 -*-
"""Build N2 ready wave 007 — derived nouns 〜化/〜性/〜的/〜感/観 + ignition terms."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-007.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("緑化","りょっか","n|vs|vt","phủ xanh | trồng cây gây rừng | xanh hóa","greening | tree planting | afforestation","1644860"),
    ("老化","ろうか","n|vs|vi|adj-no","lão hóa | già đi | thoái hóa do tuổi","ageing | senile deterioration","1612310"),
    ("酸化","さんか","n|vs|vt|vi","oxy hóa | ô-xi hóa","oxidation","1304290"),
    ("液化","えきか","n|vs|vt|vi","hóa lỏng | sự hóa lỏng","liquefaction","1174980"),
    ("気化","きか","n|vs|vi","bay hơi | hóa hơi","vaporization | evaporation","1221960"),
    ("風化","ふうか","n|vs|vi","phong hóa | phai mờ (ký ức) | mai một","weathering | fading (of memories)","1499770"),
    ("退化","たいか","n|vs|vi","thoái hóa | suy thoái | tiêu giảm","degeneration | retrogression | atrophy","1411320"),
    ("帰化","きか","n|vs|vi","nhập quốc tịch | nhập tịch","naturalization","1221290"),
    ("点火","てんか","n|vs|vt|vi","châm lửa | đốt | mồi lửa | đánh lửa","ignition | lighting | firing","1441440"),
    ("発火","はっか","n|vs|vi","bốc cháy | bắt lửa | phát hỏa","ignition | combustion | catching fire","1477180"),
    ("鎮火","ちんか","n|vs|vt|vi","dập tắt (đám cháy) | lửa tàn","extinguishing | dying out (of a fire)","1432050"),
    ("引火","いんか","n|vs|vi","bắt lửa | bén lửa | bốc cháy","ignition | catching fire","1169480"),
    ("着火","ちゃっか","n|vs|vt|vi","bén lửa | mồi cháy | đánh lửa","ignition | catching fire | setting on fire","1616510"),
    ("可塑性","かそせい","n|adj-no","tính dẻo | độ dẻo | tính khả biến","plasticity","1190890"),
    ("弾性","だんせい","n","tính đàn hồi | độ đàn hồi","elasticity","1419460"),
    ("中性","ちゅうせい","n|adj-no","trung tính | tính trung hòa | giống trung (ngữ pháp)","neutrality | neuter | androgyny","1424710"),
    ("習性","しゅうせい","n","tập tính | thói quen | bản tính","habit | behavior | trait | nature","1333130"),
    ("属性","ぞくせい","n|n-suf","thuộc tính | đặc tính","attribute | property","1405720"),
    ("適性","てきせい","n","tính phù hợp | năng khiếu | tố chất thích hợp","aptitude | suitability","1437410"),
    ("品性","ひんせい","n","phẩm cách | nhân cách | tư cách","character | personality","1490630"),
    ("人間性","にんげんせい","n","tính người | nhân tính | bản chất con người","humanity | human nature","1366920"),
    ("社会性","しゃかいせい","n","tính xã hội | khả năng hòa nhập xã hội","sociality","1658820"),
    ("基本的","きほんてき","adj-na","cơ bản | căn bản | nền tảng","fundamental | basic","1219260"),
    ("潜在的","せんざいてき","adj-na","tiềm tàng | tiềm ẩn | có tiềm năng","latent | potential","1793130"),
    ("不安感","ふあんかん","n","cảm giác bất an | nỗi lo lắng | bồn chồn","uneasy feeling | sense of anxiety","2629080"),
    ("信頼感","しんらいかん","n","cảm giác tin cậy | sự tin tưởng","feeling of trust","1359750"),
    ("存在感","そんざいかん","n","sự hiện diện | cảm giác về sự tồn tại","sense of presence","2084050"),
    ("景観","けいかん","n","cảnh quan | phong cảnh","scenery","1250820"),
    ("具体化","ぐたいか","n|vs|vt|vi","cụ thể hóa | hiện thực hóa | định hình","embodiment | materialization | realization","1245030"),
    ("明確化","めいかくか","n|vs","làm rõ | minh định | xác định rõ","clarification | definition","2390450"),
    ("効率化","こうりつか","n|vs","nâng cao hiệu suất | tối ưu hóa","making efficient | optimization","1275220"),
    ("情報化","じょうほうか","n|vs","tin học hóa | số hóa thông tin","computerization","1356390"),
    ("機械化","きかいか","n|vs|vt|vi","cơ giới hóa | máy móc hóa","mechanization","1220820"),
    ("自動化","じどうか","n|vs|vt","tự động hóa","automation","1318370"),
    ("産業化","さんぎょうか","n|vs","công nghiệp hóa (theo ngành) | sản nghiệp hóa","industrialization","2846308"),
    ("都市化","としか","n|vs","đô thị hóa","urbanization","1700830"),
    ("工業化","こうぎょうか","n|vs|vt|vi","công nghiệp hóa | đưa vào sản xuất","industrialization","1674920"),
    ("電子化","でんしか","n|vs|vt","số hóa | điện tử hóa","electronization | digitization","1443390"),
    ("複雑化","ふくざつか","n|vs|vi","phức tạp hóa | trở nên rắc rối","complication","1501370"),
    ("単純化","たんじゅんか","n|vs|vt","đơn giản hóa","simplification","1417570"),
    ("深刻化","しんこくか","n|vs|vi","trầm trọng hóa | trở nên nghiêm trọng","becoming more serious | aggravation","1362740"),
    ("鈍化","どんか","n|vs|vi","chậm lại | trì trệ | cùn đi","becoming dull | slowing down","1457580"),
    ("細分化","さいぶんか","n|vs","chia nhỏ | phân mảnh | phân khúc","subdivision | segmentation | fragmentation","2358110"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
