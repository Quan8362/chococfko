# -*- coding: utf-8 -*-
"""Build N1 ready wave 053 — literary 漢語 (set 53)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-053.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("堅牢","けんろう","adj-na|n","kiên cố | chắc chắn | bền vững | vững chãi | cứng cáp","solid | sturdy | durable | stout","1257230"),
    ("研磨","けんま","n|vs|vt","mài giũa | đánh bóng | trau dồi | rèn luyện (kỹ năng) | tôi luyện","grinding | polishing | refining (a skill)","1592730"),
    ("牽連","けんれん","n|vs","liên quan | dính líu | có quan hệ | liên đới","being related to | connection","1258320"),
    ("拳々服膺","けんけんふくよう","n|vs","khắc cốt ghi tâm | luôn ghi nhớ trong lòng | tạc dạ ghi lòng","firmly bearing in mind | engraving on one's heart","2040370"),
    ("喧伝","けんでん","n|vs|vt","rêu rao | đồn thổi rộng rãi | tuyên truyền ầm ĩ | loan tin khắp nơi","spreading around | noising about | circulating","1257060"),
    ("玄妙","げんみょう","adj-na|n","huyền diệu | thâm sâu khó hiểu | huyền bí | uyên áo","abstruse | occult | mysterious","1615320"),
    ("倹素","けんそ","adj-na|n","tằn tiện giản dị | tiết kiệm chất phác | thanh đạm","economical and simple","1256000"),
    ("建白","けんぱく","n|vs|vt","kiến nghị | tấu trình | thỉnh nguyện | dâng sớ (建白書)","a petition | a memorial","1257520"),
    ("減退","げんたい","n|vs|vi","suy giảm | sa sút | giảm sút | thoái lui | hao mòn","decline | decrease | failing | decay","1263280"),
    ("原野","げんや","n","đồng hoang | hoang dã | cánh đồng | bãi hoang | thảo nguyên","wilderness | wasteland | a moor","1262410"),
    ("権門","けんもん","n","gia đình quyền thế | nhà quyền quý | thế gia vọng tộc (権門勢家)","a powerful family","1782460"),
    ("故","こ","pref","cố | đã khuất | người quá cố | đã mất (故〜氏)","the late | the deceased","1267110"),
    ("五蘊","ごうん","n","ngũ uẩn | năm uẩn (sắc thọ tưởng hành thức) | năm yếu tố cấu thành","the five skandhas (Buddhism)","2207230"),
    ("高雅","こうが","adj-na|n","cao nhã | thanh nhã | tao nhã | trang nhã | thanh tao","refined | elegant | chaste","1615800"),
    ("向背","こうはい","n","thái độ thuận nghịch | lập trường ủng hộ hay chống | xu thế tình hình","one's attitude | the state of affairs","1277300"),
    ("豪気","ごうき","adj-na|n","hào khí | dũng cảm gan dạ | khí phách hiên ngang | quả cảm","bold | daring | valiant | stouthearted","1285550"),
    ("高士","こうし","n","cao sĩ | người cao quý | bậc nhân cách cao thượng | kẻ sĩ thanh cao","a man of noble character","1808720"),
    ("豪奢","ごうしゃ","adj-na|n","xa hoa | lộng lẫy | xa xỉ | hào nhoáng | tráng lệ","luxurious | magnificent | sumptuous","1285690"),
    ("膏薬","こうやく","n","cao dán | thuốc cao | thuốc mỡ | thuốc bôi","a plaster | an ointment | a patch","1281230"),
    ("皓々","こうこう","adj-t|adv-to","sáng vằng vặc | sáng trắng (trăng) | trống trải mênh mông","bright (esp. of the moon)","2427710"),
    ("高察","こうさつ","n","cao kiến | sự sáng suốt | nhận định cao minh (kính ngữ)","superior insight | your idea","1648580"),
    ("浩然","こうぜん","adj-t|adv-to","khoáng đạt | hào hùng phóng khoáng | dạt dào | bao la (浩然の気)","broadminded | magnanimous | abundant","1279970"),
    ("向日","こうじつ","n","quầng sáng mặt trời | quang tượng mặt trời (hiện tượng quang học)","anthelion (optical phenomenon)","2694870"),
    ("高踏","こうとう","n","cao đạo | siêu thoát | thanh cao tách biệt | trí thức kiêu kỳ (高踏派)","highbrow | aloof | transcendent","1809580"),
    ("紅塵","こうじん","n","bụi hồng trần | cõi tục lụy | chốn phồn hoa | đám bụi đỏ","a cloud of dust | the mundane world","1837110"),
    ("碩儒","せきじゅ","n","bậc đại nho | học giả uyên thâm | nhà Nho lỗi lạc","a great (Confucian) scholar","1383730"),
    ("浩瀚","こうかん","adj-na|n","đồ sộ | dày cộp | nhiều quyển | phong phú đồ sộ (sách vở)","bulky | voluminous","1279980"),
    ("口吻","こうふん","n","giọng điệu | cách ăn nói | khẩu khí | hàm ý lời nói | mõm (động vật)","a way of speaking | intimation | a snout","1276880"),
    ("恒心","こうしん","n","lòng kiên định | tâm vững vàng | sự bền chí (恒産なき者は恒心なし)","steadiness | constancy of mind","1278770"),
    ("弘誓","ぐぜい","n","hoằng thệ | đại nguyện của Phật | lời nguyện độ sinh","Buddha's great vows","1872960"),
    ("洪大","こうだい","adj-na|n","to lớn | vĩ đại | mênh mông | bao la rộng lớn","great | immense","1615780"),
    ("劫火","ごうか","n","kiếp hỏa | ngọn lửa hủy diệt thế giới | lửa tận thế","a world-destroying conflagration","1284190"),
    ("紅涙","こうるい","n","giọt lệ hồng | nước mắt người con gái | lệ đắng cay (紅涙を絞る)","feminine tears | bitter tears","1280800"),
    ("膠着","こうちゃく","n|vs|vi","bế tắc | giằng co | đình trệ | dính chặt | bám dính (膠着状態)","deadlock | stalemate | adhesion","1571100"),
    ("業病","ごうびょう","n","bệnh nghiệp báo | bệnh nan y (do nghiệp kiếp trước) | bệnh kinh niên","an incurable disease (from past karma)","1239500"),
    ("合従連衡","がっしょうれんこう","n","hợp tung liên hoành | sách lược liên minh phân hợp | kết và phá liên minh tùy thời","making and breaking alliances as expedient","1284840"),
    ("強面","こわもて","n|adj-no|adj-na","vẻ mặt dữ tợn | bộ mặt hung tợn | thái độ cứng rắn | hầm hố | đe nẹt","a fierce look | a hard-line stance","2145350"),
    ("木霊","こだま","n|vs|vi","tiếng vọng | tiếng dội lại | hồn cây | mộc linh","an echo | a tree spirit","1807610"),
    ("小夜","さよ","n","đêm | ban đêm | đêm khuya (小夜曲: dạ khúc)","evening | night","1743950"),
    ("五風十雨","ごふうじゅうう","n","mưa thuận gió hòa | thời tiết ôn hòa | thái bình thịnh trị","seasonable weather | halcyon times of peace","2030810"),
    ("木立","こだち","n","lùm cây | rặng cây | bụi cây | khóm cây","a cluster of trees | a grove","1593260"),
    ("今上","きんじょう","n","đương kim hoàng đế | vị vua hiện tại | thiên hoàng đương vị (今上天皇)","the present emperor | the reigning emperor","1289290"),
    ("歳暮","せいぼ","n","quà cuối năm | cuối năm | dịp tất niên (お歳暮)","a year-end gift | the year's end","1295000"),
    ("細密","さいみつ","adj-na|n","tỉ mỉ | chi tiết | tinh xảo | cặn kẽ chi li","finely detailed | minute","1295790"),
    ("財宝","ざいほう","n","của báu | châu báu | kho báu | tài sản quý giá","treasure | valuables","1296990"),
    ("細目","さいもく","n","chi tiết | mục cụ thể | điều khoản chi tiết | hạng mục con","particulars | details | specified items","1295810"),
    ("逆しま","さかしま","n|adj-na","ngược | đảo lộn | lộn ngược | trái khoáy | phi lý","reverse | upside down | unreasonable","1445760"),
    ("盛り場","さかりば","n","khu sầm uất | phố nhộn nhịp | khu ăn chơi | chốn phồn hoa","a busy place | amusement quarters","1379710"),
    ("左記","さき","n","như sau | nội dung dưới đây | điều ghi bên trái (văn dọc)","the following | as stated at left","1290860"),
    ("詐術","さじゅつ","n","mánh lừa | thủ đoạn gian lận | trò bịp bợm | mưu lừa gạt","swindling | deception","1798380"),
    ("殺意","さつい","n","ý định giết người | sát ý | ý đồ sát nhân | thú tính giết chóc","an intent to kill | a murderous impulse","1299040"),
    ("猿真似","さるまね","n|vs","bắt chước máy móc | nhại theo mù quáng | học đòi vô tội vạ | a dua bắt chước","indiscriminate imitation | monkey see monkey do","1177460"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
