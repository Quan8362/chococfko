# -*- coding: utf-8 -*-
"""Build N1 ready wave 010 — politics/military formal terms (set 10)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-010.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("所轄","しょかつ","n|vs|vt|adj-no","thẩm quyền | quản hạt | địa bàn phụ trách","jurisdiction","1343170"),
    ("専制","せんせい","n|vs|adj-no","chuyên chế | độc đoán | toàn quyền","despotism | autocracy","1389810"),
    ("独裁","どくさい","n|vs|vi","độc tài | chuyên quyền | toàn trị","dictatorship | despotism | autocracy","1455800"),
    ("寡頭","かとう","n","thiểu số (cầm quyền) | số ít người | quả đầu","small number of people (in power)","2853978"),
    ("宗主","そうしゅ","n","tông chủ | nước bá chủ | tôn chủ","suzerain","1654770"),
    ("属国","ぞっこく","n","nước chư hầu | thuộc quốc | nước phụ thuộc","vassal state | dependency","1652900"),
    ("傀儡","かいらい","n","con rối | bù nhìn | tay sai | kẻ giật dây","puppet | marionette | dummy | puppeteer","1585480"),
    ("官憲","かんけん","n","quan chức | nhà chức trách | chính quyền","officials | authorities","1211670"),
    ("枢密","すうみつ","n","cơ mật | bí mật quốc gia | mật vụ triều chính","state secrets","1373370"),
    ("親政","しんせい","n","đích thân trị vì | vua tự nắm quyền | thân chính","direct Imperial rule","1646970"),
    ("詔勅","しょうちょく","n","chiếu chỉ | chiếu thư | sắc lệnh của vua","imperial edict | decree","1351720"),
    ("勅令","ちょくれい","n","sắc lệnh (hoàng đế) | chiếu lệnh | sắc dụ","imperial edict","1430550"),
    ("布告","ふこく","n|vs|vt","bố cáo | tuyên cáo | ban bố | tuyên bố (chiến tranh)","edict | proclamation | declaration","1496860"),
    ("鎮静","ちんせい","n|vs|vt|vi","lắng dịu | trấn an | bình ổn | an thần","calming down | pacification | sedation","1432120"),
    ("掃討","そうとう","n|vs|vt","truy quét | càn quét | quét sạch (tàn quân)","cleaning up (enemy) | mopping up","1399810"),
    ("潰走","かいそう","n|vs|vi","tháo chạy tán loạn | tan rã bỏ chạy | đại bại bỏ chạy","rout | stampede","1617490"),
    ("進駐","しんちゅう","n|vs|vi","chiếm đóng | đồn trú | tiến vào đóng quân","occupation | stationing","1366130"),
    ("駐屯","ちゅうとん","n|vs|vi","đóng quân | trú đóng | đồn trú","stationing (troops) | garrisoning","1426940"),
    ("募兵","ぼへい","n|vs|vi","tuyển quân | chiêu binh | mộ lính","recruiting (soldiers)","1670590"),
    ("召集","しょうしゅう","n|vs|vt","triệu tập | gọi nhập ngũ | triệu hồi","convening | call-up (military)","1346500"),
    ("堡塁","ほうるい","n","pháo đài | công sự | thành lũy | cứ điểm","fort | fortification | stronghold","1585680"),
    ("急襲","きゅうしゅう","n|vs|vt","tập kích | đột kích bất ngờ | tấn công chớp nhoáng","raid | assault | surprise attack","1228740"),
    ("苦戦","くせん","n|vs|vi","trận chiến cam go | vật lộn vất vả | đánh chật vật","hard fight | struggle | tight contest","1244540"),
    ("優勢","ゆうせい","n|adj-na","ưu thế | thế thượng phong | chiếm ưu thế","superiority | predominance | preponderance","1539340"),
    ("戦況","せんきょう","n","tình hình chiến sự | diễn biến trận đánh | cục diện chiến tranh","war situation | progress of a battle","1646070"),
    ("戦局","せんきょく","n","cục diện chiến tranh | tình thế chiến cuộc","state of the war | war situation","1390190"),
    ("戦没","せんぼつ","n|vs|vi","tử trận | hy sinh nơi chiến trường | tử vong khi chiến đấu","death in battle | killed in action","1390550"),
    ("戦災","せんさい","n","thiệt hại chiến tranh | tổn thất do chiến tranh","war damage","1390230"),
    ("惨敗","ざんぱい","n|vs|vi","thảm bại | bại trận ê chề | thua tan tác","ignominious defeat | crushing failure","1579460"),
    ("完敗","かんぱい","n|vs|vi","thua trắng | bại hoàn toàn | thất bại toàn diện","complete defeat | utter defeat","1211550"),
    ("大勝","たいしょう","n|vs|vi","đại thắng | thắng áp đảo | thắng vang dội","great victory | overwhelming victory","1414100"),
    ("勝機","しょうき","n","thời cơ chiến thắng | cơ hội thắng | thắng cơ","chance to win | opportunity to win","2068950"),
    ("勝算","しょうさん","n","khả năng thắng | cơ hội thành công | thắng toán","prospects of victory | chances of success","1346170"),
    ("凱旋","がいせん","n|vs|vi","khải hoàn | thắng trận trở về | chiến thắng vẻ vang","triumphant return","1203200"),
    ("栄冠","えいかん","n","vòng nguyệt quế | vinh quang | vương miện chiến thắng","laurels | garland","1173890"),
    ("覇者","はしゃ","n","bá chủ | nhà vô địch | kẻ chinh phục | quán quân","supreme ruler | conqueror | champion","1470960"),
    ("雄図","ゆうと","n","hùng đồ | kế hoạch lớn lao | dự án vĩ đại | hoài bão lớn","ambitious plan | grand project","1662550"),
    ("偉勲","いくん","n","đại công | công lao to lớn | kỳ tích","great achievement","1155850"),
    ("武勲","ぶくん","n","võ công | chiến công | công trạng quân sự","feats of arms | military exploits","1498550"),
    ("勲章","くんしょう","n","huân chương | huy chương | bội tinh","decoration | order | medal","1247240"),
    ("褒章","ほうしょう","n","huy chương khen thưởng | bằng khen | huy chương công trạng","medal of honour | medal of merit","1518020"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
