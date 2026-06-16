# -*- coding: utf-8 -*-
"""Build N2 ready wave 043 — system/regulations, methods, history/record, logic, consistency, distribution."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-043.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("陣容","じんよう","n","đội hình | thế trận | dàn nhân sự | ê-kíp","battle formation | lineup | team structure","1370260"),
    ("編制","へんせい","n|vs|vt","biên chế | tổ chức | sắp xếp đội ngũ","organization | forming","1617100"),
    ("規程","きてい","n","quy trình | quy chế | nội quy chính thức","official regulations | inner rules","1223080"),
    ("細則","さいそく","n","quy định chi tiết | điều lệ phụ | nội quy cụ thể","bylaws | detailed regulations","1768400"),
    ("条項","じょうこう","n","điều khoản | điều mục | quy định","clause | article | stipulations","1356550"),
    ("条文","じょうぶん","n","điều luật | nội dung điều khoản | văn bản quy định","text (of a law) | provisions","1356560"),
    ("箇条","かじょう","n","khoản | mục | điều | điểm","item | article | clause | point","1194490"),
    ("要件","ようけん","n","yêu cầu | điều kiện cần | việc quan trọng","requirement | requisite | necessary condition","1546730"),
    ("手法","しゅほう","n","thủ pháp | phương pháp | kỹ thuật","technique | method","1328380"),
    ("技法","ぎほう","n","kỹ pháp | kỹ thuật | thủ pháp","technique","1225240"),
    ("流儀","りゅうぎ","n","cách làm | phong cách | trường phái | lối riêng","way (of doing things) | style | school","1552260"),
    ("やり方","やりかた","n","cách làm | phương pháp | cách thức","way (of doing) | manner | method","1012960"),
    ("手立て","てだて","n","biện pháp | phương cách | cách thức","means | method","1328410"),
    ("方便","ほうべん","n","phương tiện | cách lách | thủ đoạn | phương tiện (Phật)","means | expedient | upaya","1517080"),
    ("便宜","べんぎ","n","sự thuận tiện | sự ưu đãi | sự tiện lợi | tùy nghi","convenience | accommodation | expediency","1512480"),
    ("措置","そち","n|vs|vt","biện pháp | giải pháp | hành động xử lý","measure | step | action","1396530"),
    ("推移","すいい","n|vs|vi","diễn biến | biến chuyển | tiến triển | trôi qua","transition | change | development | passing (of time)","1371080"),
    ("変遷","へんせん","n|vs|vi","biến thiên | thay đổi | thăng trầm","change | transition | vicissitudes","1511260"),
    ("職歴","しょくれき","n","kinh nghiệm làm việc | quá trình công tác","work experience | work history","1357590"),
    ("病歴","びょうれき","n","tiền sử bệnh | bệnh sử","medical history | case history","1622370"),
    ("前科","ぜんか","n","tiền án | tiền sự | lý lịch phạm tội","previous conviction | criminal record","1392650"),
    ("戦績","せんせき","n","thành tích thi đấu | chiến tích | kết quả trận đấu","war record | score | results","1646170"),
    ("所産","しょさん","n","thành quả | sản phẩm | kết quả","result | fruit (of) | product (of)","1343240"),
    ("賜物","たまもの","n","tặng vật | thành quả | hồng phúc | quà tặng","gift | boon | (good) result | fruit (of efforts)","1661230"),
    ("前置き","まえおき","n|vs|vi","lời mở đầu | lời rào đón | phần dẫn nhập","preface | introduction | preamble","1393630"),
    ("序論","じょろん","n","phần mở đầu | dẫn luận | lời nói đầu","introduction | preface","1345560"),
    ("本論","ほんろん","n","phần chính | nội dung chính | luận điểm chính","main subject | main discourse","1523320"),
    ("各論","かくろん","n","luận điểm chi tiết | thảo luận từng mục | bàn cụ thể","item-by-item discussion | detailed exposition","1205170"),
    ("総論","そうろん","n","tổng luận | nhận định chung | khái luận","general remarks","1610110"),
    ("立論","りつろん","n|vs|vi","lập luận | xây dựng luận điểm | biện luận","argumentation","1551870"),
    ("筋道","すじみち","n","lý lẽ | mạch lạc | trình tự | logic | đầu đuôi","reason | logic | order | thread (of an argument)","1241800"),
    ("条理","じょうり","n","lẽ phải | đạo lý | sự hợp lý","reason","1356600"),
    ("理にかなう","りにかなう","exp|v5u","hợp lý | có lý | đúng lẽ","to make sense","2085710"),
    ("辻褄","つじつま","n","sự khớp logic | sự nhất quán | đầu đuôi xuôi","coherence | consistency","1433730"),
    ("整合","せいごう","n|vs|vi|adj-no","sự nhất quán | tính tương thích | điều chỉnh khớp","adjustment | coordination | conformity","1376170"),
    ("不整合","ふせいごう","n|adj-no","không nhất quán | không khớp | mâu thuẫn | lệch","inconsistency | mismatch | misalignment","1493340"),
    ("食い違い","くいちがい","n","sự khác biệt | bất đồng | mâu thuẫn | lệch nhau","disagreement | conflict | discrepancy","1358100"),
    ("齟齬","そご","n|vs|vi","sự lệch lạc | bất nhất | trục trặc | vênh nhau","inconsistency | discrepancy | failure","1575540"),
    ("不一致","ふいっち","n","sự không khớp | bất đồng | không nhất trí","discrepancy | disagreement | mismatch","1491270"),
    ("落差","らくさ","n","chênh lệch độ cao | độ chênh | khoảng cách | sự hụt hẫng","difference in elevation | drop | gap","1548740"),
    ("較差","かくさ","n|adj-no","biên độ | khoảng dao động (nhiệt độ)","range","1864620"),
    ("隔たり","へだたり","n","khoảng cách | sự cách biệt | sự xa cách | hố ngăn","distance | gap | disparity | estrangement","1206330"),
    ("開き","ひらき","n|suf","sự mở | khoảng cách | cá mổ phơi khô | phần nới","opening | gap | dried and opened fish","1989500"),
    ("ずれ","ずれ","n","sự lệch | độ trễ | sự xê dịch | khác biệt | sai lệch","gap | lag | slippage | discrepancy","1006450"),
    ("偏向","へんこう","n|vs|vi","thiên hướng | thành kiến | sự lệch lạc | độ lệch","propensity | bias | inclination | deflection","1510400"),
    ("偏在","へんざい","n|vs|vi","phân bố lệch | tập trung lệch một nơi","uneven distribution | maldistribution","1510460"),
    ("遍在","へんざい","n|vs|vi","hiện diện khắp nơi | có mặt khắp chốn | phổ biến","omnipresence | ubiquity","1512330"),
    ("分散","ぶんさん","n|vs|vt|vi","phân tán | tản ra | phân cấp | phương sai","dispersion | scattering | decentralization | variance","1503580"),
    ("散在","さんざい","vs|vi","nằm rải rác | phân tán rải rác | rải khắp","to be scattered | to be found here and there","1303520"),
    ("点在","てんざい","n|vs|vi","rải rác | nằm lác đác | điểm xuyết khắp nơi","being dotted about | being scattered","1441580"),
    ("集積","しゅうせき","n|vs|vt|vi","tích lũy | gom tụ | tích hợp","accumulation","1333710"),
    ("堆積","たいせき","n|vs|vt|vi","chất đống | bồi tụ | trầm tích | tích tụ","accumulation | pile | sedimentation","1409780"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
