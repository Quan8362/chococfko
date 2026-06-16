# -*- coding: utf-8 -*-
"""Build N2 ready wave 012 — sino-verbs: perception, thought, examination, negotiation, integration."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-012.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("推察","すいさつ","n|vs|vt","suy đoán | phỏng đoán | đoán biết","guess | conjecture | surmise","1371110"),
    ("予知","よち","n|vs|vt","dự báo | tiên đoán | linh cảm trước","foresight | foreknowledge | prediction","1543220"),
    ("予見","よけん","n|vs|vt","tiên liệu | dự kiến | nhìn xa trông rộng","foresight | foreknowledge","1542930"),
    ("予感","よかん","n|vs|vt","linh cảm | dự cảm | có dự cảm","presentiment | premonition | hunch","1542910"),
    ("洞察","どうさつ","n|vs|vt","thấu hiểu | sáng suốt | nhìn thấu","discernment | insight","1453890"),
    ("察知","さっち","vs|vt|n","cảm nhận | nhận ra | đoán biết | phát hiện","to sense | to infer | to perceive","1298750"),
    ("認知","にんち","n|vs|vt","nhận thức | thừa nhận | nhận biết","acknowledgement | recognition | cognition","1467580"),
    ("曲解","きょっかい","n|vs|vt","xuyên tạc | hiểu sai (cố ý) | bóp méo","misinterpretation | distortion | perversion","1239800"),
    ("誤認","ごにん","n|vs|vt","nhận nhầm | nhìn nhầm | nhầm lẫn","misrecognition | mistaking (x for y)","1271430"),
    ("連想","れんそう","n|vs|vt","liên tưởng | gợi nhớ | liên hệ","association (of ideas) | suggestion","1559600"),
    ("発想","はっそう","n|vs|vt","ý tưởng | cách nghĩ | phát kiến | lối tư duy","idea | conception | way of thinking","1477660"),
    ("着想","ちゃくそう","n|vs|vt|vi","ý tưởng | sáng kiến | nảy ra ý","conception | idea","1423140"),
    ("回想","かいそう","n|vs|vt","hồi tưởng | hồi ức | nhớ lại","recollection | retrospection | reminiscence","1199590"),
    ("追想","ついそう","n|vs|vt","tưởng nhớ | hồi tưởng | hoài niệm","recollection | reminiscence","1432580"),
    ("黙想","もくそう","n|vs|vt","trầm tư | tĩnh tâm | suy ngẫm trong im lặng","meditation | silent contemplation","1773480"),
    ("瞑想","めいそう","n|vs|vi","thiền định | trầm tư | suy tưởng","meditation | contemplation","1569910"),
    ("思索","しさく","n|vs|vt","tư duy | suy tư | trầm tư","speculation | thinking | meditation","1309540"),
    ("思考","しこう","n|vs|vt|vi|adj-no","tư duy | suy nghĩ | cách suy nghĩ","thought | consideration | thinking","1309530"),
    ("熟考","じゅっこう","n|vs|vt","cân nhắc kỹ | suy nghĩ thấu đáo | đắn đo","careful consideration | thinking over carefully","1337840"),
    ("吟味","ぎんみ","n|vs|vt","xem xét kỹ | chọn lựa kỹ | thẩm tra","close examination | careful selection | scrutiny","1243390"),
    ("照合","しょうごう","n|vs|vt","đối chiếu | so khớp | kiểm chứng","check (against) | collation | verification","1350920"),
    ("照会","しょうかい","n|vs|vt","tra cứu | hỏi (thông tin) | giới thiệu chuyển","inquiry | query | referral","1350910"),
    ("観賞","かんしょう","n|vs|vt","thưởng ngoạn | ngắm (cho vui mắt) | thưởng thức","admiration | appreciation | viewing (for pleasure)","1214940"),
    ("計量","けいりょう","n|vs|vt","đo lường | cân đo | hệ mét","measuring | weighing | metric","1252260"),
    ("算定","さんてい","n|vs|vt|adj-no","tính toán | ước tính | định mức","calculation | estimation | computation","1303950"),
    ("推計","すいけい","n|vs|vt","ước tính | ước lượng | dự tính","estimate | estimation","1371100"),
    ("論戦","ろんせん","n|vs|vi","khẩu chiến | tranh luận | đấu lý","battle of words | debate | dispute","1561750"),
    ("争議","そうぎ","n","tranh chấp | tranh cãi | đình công","dispute | quarrel | strike","1400650"),
    ("納得","なっとく","n|vs|vt|vi","đồng tình | thông suốt | chấp thuận | hiểu ra","consent | acceptance | being convinced","1470080"),
    ("調停","ちょうてい","n|vs|vt|adj-no","hòa giải | dàn xếp | trung gian phân xử","arbitration | conciliation | mediation","1429260"),
    ("斡旋","あっせん","n|vs|vt","làm trung gian | giới thiệu | môi giới | điều đình","good offices | mediation | acting as a go-between","1153410"),
    ("媒介","ばいかい","n|vs|vt","trung gian | môi giới | truyền (bệnh) | dẫn truyền","mediation | acting as an intermediary | transmission","1473380"),
    ("折衝","せっしょう","n|vs|vi","đàm phán | thương lượng","negotiation","1385950"),
    ("談判","だんぱん","n|vs|vt|vi","đàm phán | thương thuyết | đòi hỏi","negotiations | bargaining | making demands","1838880"),
    ("商談","しょうだん","n|vs","đàm phán kinh doanh | thương lượng làm ăn","business discussion | negotiation","1347170"),
    ("合致","がっち","n|vs|vi","khớp | nhất quán | phù hợp | đúng theo","agreement | concurrence | conformance","1285100"),
    ("集約","しゅうやく","n|vs|vt","tổng hợp | gom lại | tập trung | đúc kết","putting together | aggregating | summarizing","1333790"),
    ("集結","しゅうけつ","n|vs|vt|vi","tập kết | tụ họp | tập hợp (quân)","massing (of troops) | gathering","1659240"),
    ("結集","けっしゅう","n|vs|vt|vi","tập hợp | huy động | dồn (sức)","concentration (of forces) | gathering together","1254860"),
    ("共同","きょうどう","n|n-pref|vs|vi|adj-no","chung | hợp tác | cộng đồng | dùng chung","cooperation | collaboration | communal use","1591660"),
    ("区別","くべつ","n|vs|vt","phân biệt | khác biệt | phân loại","distinction | differentiation | difference","1244250"),
    ("弁別","べんべつ","n|vs|vt","phân biệt | nhận biết | tách bạch","distinguishing | distinction | discrimination","1513110"),
    ("鑑別","かんべつ","n|vs|vt|adj-no","phân loại | giám biệt | phân định | sàng lọc","discrimination | judgement | separation","1215220"),
    ("仕分け","しわけ","n|vs|vt","phân loại | sắp xếp | định khoản (kế toán)","classification | sorting | assortment","1595100"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
