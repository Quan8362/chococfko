# -*- coding: utf-8 -*-
"""Build N1 ready wave 001 — formal Sino-Japanese nouns/verbs (set 1)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-001.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("安泰","あんたい","adj-na|n","an khang | ổn định | bình yên vô sự","security | stability | peace","1154070"),
    ("暗礁","あんしょう","n","đá ngầm | trở ngại bất ngờ | bế tắc","reef | sunken rock | unforeseen difficulty","1154580"),
    ("愛憎","あいぞう","n","yêu và ghét | ái ố","love and hate","1575670"),
    ("相次ぐ","あいつぐ","v5g|vi","nối tiếp nhau | liên tiếp | dồn dập","to follow in succession | to happen one after another","1400980"),
    ("欺く","あざむく","v5k|vt","lừa dối | đánh lừa | gạt | qua mặt","to deceive | to delude | to trick | to fool","1225420"),
    ("圧巻","あっかん","n|adj-no","đỉnh cao | phần xuất sắc nhất | tuyệt phẩm","highlight | best part | spectacular","1152990"),
    ("圧倒","あっとう","vs|vt|n","áp đảo | đè bẹp | lấn át | choáng ngợp","to overwhelm | to overpower | to crush","1153260"),
    ("過ち","あやまち","n","sai lầm | lỗi lầm | sơ suất","fault | error | indiscretion","1196010"),
    ("歩む","あゆむ","v5m|vi","bước đi | đi (con đường) | trải qua | tiến tới","to walk | to tread (a path) | to advance","1514360"),
    ("遺憾","いかん","adj-na|n","đáng tiếc | lấy làm tiếc | đáng trách","regrettable | unsatisfactory | deplorable","1159090"),
    ("一律","いちりつ","adj-no|adj-na|adv|n","đồng loạt | đồng đều | nhất loạt | cào bằng","uniform | even | across-the-board","1167250"),
    ("一環","いっかん","n|adj-no","một phần (trong kế hoạch) | một mắt xích","link (in a chain) | part (of a plan)","1161550"),
    ("逸材","いつざい","n","nhân tài kiệt xuất | người tài năng hiếm có","outstanding talent | gifted person","1167690"),
    ("遺族","いぞく","n","gia quyến (người đã mất) | thân nhân người quá cố","bereaved family | surviving family","1159420"),
    ("隠居","いんきょ","n|vs|vi","về hưu ở ẩn | sống ẩn dật | người về hưu","retirement | leading a quiet life | retiree","1170690"),
    ("因縁","いんねん","n","nhân duyên | duyên nợ | mối ràng buộc | cơ duyên","fate | destiny | connection | karma","1168670"),
    ("雲泥","うんでい","n","khác biệt một trời một vực","great difference","1173230"),
    ("有無","うむ","n","có hay không | sự hiện diện | đồng ý hay từ chối","existence or nonexistence | presence or absence","1541610"),
    ("潤む","うるむ","v5m|vi","rưng rưng (nước mắt) | ướt | nhòa đi | nghẹn ngào","to be wet (with tears) | to be moist | to become blurred","1341820"),
    ("婉曲","えんきょく","adj-na|n","uyển chuyển | tế nhị | vòng vo | gián tiếp","euphemistic | roundabout | indirect","1566060"),
    ("横暴","おうぼう","adj-na|n","ngang ngược | bạo ngược | chuyên quyền | độc đoán","violence | oppression | high-handedness | tyranny","1181060"),
    ("往来","おうらい","n|vs|vt|vi","qua lại | đi lại | giao thông | đường phố | giao thiệp","coming and going | traffic | street | association","1179790"),
    ("殴打","おうだ","n|vs|vt","đánh | đấm | hành hung","hit | strike | blow","1181410"),
    ("卸す","おろす","v5s|vt","bán buôn | bán sỉ | mài (rau củ)","to sell wholesale | to grate (vegetables)","1183050"),
    ("回顧","かいこ","n|vs|vt|adj-no","hồi tưởng | nhìn lại | hồi cố | ôn lại","recollecting | reminiscing | looking back | retrospection","1199440"),
    ("懐疑","かいぎ","n|vs|vt|vi","hoài nghi | nghi ngờ | hoài nghi chủ nghĩa","doubt | skepticism | disbelief","1200530"),
    ("垣根","かきね","n","hàng rào | bờ giậu | ranh giới | rào cản","hedge | fence | border | barrier","1204800"),
    ("隔離","かくり","n|vs|vt|vi|adj-no","cách ly | tách biệt | cô lập | kiểm dịch","isolation | segregation | quarantine","1206440"),
    ("駆ける","かける","v1|vi","chạy | phi nhanh | phóng (ngựa) | lao tới","to run | to dash | to gallop | to charge","1244720"),
    ("固唾","かたず","n","nước bọt nuốt khan (lúc căng thẳng)","saliva held in one's mouth during tension","2007650"),
    ("頑な","かたくな","adj-na","ngoan cố | cứng đầu | bướng bỉnh | cố chấp","obstinate | stubborn | die-hard","1217650"),
    ("完遂","かんすい","n|vs|vt","hoàn thành trọn vẹn | thực hiện đến cùng","successful execution | accomplishment | completion","1211480"),
    ("勘弁","かんべん","n|vs|vt","tha thứ | bỏ qua | lượng thứ | nhẫn nhịn","pardon | forgiveness | forbearance","1210870"),
    ("喚起","かんき","n|vs|vt","khơi gợi | gợi lên | đánh thức | kêu gọi","arousal | awakening | evocation","1211270"),
    ("危惧","きぐ","n|vs|vt","lo ngại | e ngại | bất an | lo sợ","apprehension | misgivings | fear | anxiety","1591130"),
    ("軌道","きどう","n","quỹ đạo | đường ray | nề nếp | đúng hướng","orbit | trajectory | (railroad) track | proper course","1223980"),
    ("忌避","きひ","n|vs|vt|vi","né tránh | lảng tránh | thoái thác | bác bỏ (thẩm phán)","evasion | avoidance | shirking | recusation","1220120"),
    ("糾弾","きゅうだん","n|vs|vt","lên án | chỉ trích gay gắt | quy kết tội","censure | denunciation | blaming","1230180"),
    ("享受","きょうじゅ","n|vs|vt","hưởng thụ | tận hưởng | thụ hưởng (quyền lợi)","enjoyment | reception (of a right) | having","1233280"),
    ("脅威","きょうい","n|vs|vt","mối đe dọa | sự uy hiếp | hiểm họa","threat | menace","1238090"),
    ("驚異","きょうい","n|adj-no","kỳ diệu | kỳ quan | điều kinh ngạc","wonder | miracle | amazement","1238700"),
    ("緊迫","きんぱく","n|vs|vi","căng thẳng | căng như dây đàn | tình thế gay cấn","tension | strain","1241890"),
    ("工面","くめん","n|vs|vt","xoay xở (tiền) | chạy vạy | tình hình tài chính","contrivance | managing to raise money","1278280"),
    ("首尾","しゅび","n|vs","đầu đuôi | từ đầu đến cuối | kết quả | diễn biến","beginning and end | result | outcome","1329390"),
    ("形骸","けいがい","n","cái xác (vô hồn) | bộ khung | hình thức suông | hữu danh vô thực","(soulless) body | framework | mere shell | dead letter","1250250"),
    ("啓発","けいはつ","n|vs|vt","khai sáng | giác ngộ | nâng cao nhận thức | bồi dưỡng","enlightenment | edification | public awareness","1250040"),
    ("傾倒","けいとう","n|vs|vi","say mê | ngưỡng mộ hết lòng | dốc lòng | đổ sụp","devoting oneself to | being an ardent admirer | tipping over","1249580"),
    ("警鐘","けいしょう","n","hồi chuông cảnh báo | lời cảnh tỉnh","alarm bell | warning | wake-up call","1252470"),
    ("懸念","けねん","n|vs|vt","lo lắng | quan ngại | bận tâm | lo sợ","worry | fear | anxiety | concern","1257720"),
    ("倹約","けんやく","n|vs|vt|adj-na","tiết kiệm | tằn tiện | dè sẻn","thrift | economy | frugality","1256010"),
    ("牽制","けんせい","n|vs|vt","kiềm chế | kìm hãm | ghìm | nắn gân | nghi binh","check | keeping in check | restraint | feint","1258290"),
    ("酷似","こくじ","n|vs|vi","giống hệt | giống như đúc | rất giống","resembling closely | being strikingly similar","1287360"),
    ("固執","こしつ","n|vs|vt|vi","cố chấp | khăng khăng giữ | bám víu (quan điểm)","sticking to (an opinion) | adherence | insistence","1578520"),
    ("根底","こんてい","n","gốc rễ | nền tảng | căn nguyên | cơ sở","root | basis | foundation","1290260"),
    ("混迷","こんめい","n|vs|vi","hỗn loạn | rối ren | mơ hồ rối bời","turmoil | chaos | confusion","1290540"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
