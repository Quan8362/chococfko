# -*- coding: utf-8 -*-
"""Build N1 ready wave 044 — formal/colloquial nouns + 慣用句 (set 44)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-044.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("弔い","とむらい","n","tang lễ | đám tang | lời chia buồn | việc tang","a funeral | condolence","1581750"),
    ("ちょこちょこ","ちょこちょこ","adv|adv-to|vs","lon ton | lăng xăng | chốc chốc | luôn tay luôn chân | thỉnh thoảng","with small quick steps | restlessly | now and then","1007800"),
    ("猪突","ちょとつ","n|vs|vi","liều lĩnh | nông nổi xông tới | lao đầu bất chấp (猪突猛進)","recklessness | foolhardiness","1427050"),
    ("ちょろまかす","ちょろまかす","v5s|vt","thó | xoáy | thuổng | lén lấy | ăn cắp vặt","to pilfer | to filch | to make off with","2454220"),
    ("珍重","ちんちょう","n|vs","quý trọng | trân quý | xem là báu vật | đánh giá cao","prizing | valuing highly | esteeming","1431900"),
    ("追憶","ついおく","n|vs|vt|adj-no","hồi ức | hoài niệm | nhớ lại | tưởng nhớ chuyện cũ","recollection | reminiscence","1432450"),
    ("使い走り","つかいばしり","n|vs","chạy việc vặt | sai vặt | đứa chạy vặt | tay sai lon ton","running errands | an errand boy | a gofer","1663950"),
    ("作り話","つくりばなし","n","chuyện bịa | chuyện hư cấu | chuyện tưởng tượng | bịa đặt","a made-up story | fiction | a fabrication","1297480"),
    ("唾","つば","n","nước bọt | nước miếng | đờm dãi (唾をつける: xí phần)","saliva | spit | spittle","1408410"),
    ("釣果","ちょうか","n","thành quả câu cá | lượng cá câu được | chiến lợi phẩm câu cá","one's catch (fishing)","1773760"),
    ("徒然","つれづれ","n|adj-na","buồn tẻ | rảnh rỗi vô vị | nhàn nhã chán chường | tịch mịch","tedium | boredom | ennui","1649680"),
    ("手枷","てかせ","n","còng tay | gông cùm | sự ràng buộc | xiềng xích (手枷足枷)","handcuffs | restraints","1328460"),
    ("手切れ","てぎれ","n","cắt đứt quan hệ | đoạn tuyệt | chia tay | dứt tình (手切れ金)","severing of relations | a break-up","1653510"),
    ("手心","てごころ","n","sự châm chước | nương tay | du di | linh động xử lý (手心を加える)","discretion | consideration | leniency","1327940"),
    ("手向かい","てむかい","n|vs|vi","chống cự | phản kháng | kháng cự | đối kháng","resistance","1698570"),
    ("手綱","たづな","n","dây cương | dây kiểm soát | sự kìm cương (手綱を締める)","reins | the bridle | control","1327630"),
    ("出不精","でぶしょう","n|adj-na|adj-no","lười ra ngoài | thích ở nhà | ngại đi đâu | dân ở lì trong nhà","a homebody | a stay-at-home","1340240"),
    ("手弁当","てべんとう","n","tự mang cơm trưa | làm không công | tự lo chi phí | làm thiện nguyện","bringing one's own lunch | working without pay","1698450"),
    ("寺子屋","てらこや","n","trường làng thời Edo | lớp học ở chùa | trường tư thục cổ","a temple elementary school (Edo period)","1664550"),
    ("手練れ","てだれ","n","tay nghề cao | bậc thầy | người lão luyện | cao thủ","mastery | a master hand | an expert","2848459"),
    ("手分け","てわけ","n|vs|vt|vi","chia việc | phân công | chia nhóm | tản ra (tìm kiếm)","division of work | splitting into groups","1328340"),
    ("天下り","あまくだり","n|vs|vi","quan chức về hưu nhận chức béo bở | mệnh lệnh áp đặt từ trên | giáng chức ép buộc","ex-bureaucrats taking lucrative private jobs | a top-down imposition","1438480"),
    ("電光","でんこう","n","tia chớp | ánh điện | ánh sáng điện (電光石火: nhanh như chớp)","lightning | electric light","1443260"),
    ("点取り","てんとり","n","ghi điểm | kiếm điểm | chạy theo điểm số (点取り虫)","scoring | earning points","1441630"),
    ("天引き","てんびき","n|vs|vt","khấu trừ trước | trừ thẳng (thuế, lãi) | trích trước","deduction in advance (of tax, etc.)","1598490"),
    ("道楽","どうらく","n|vs|vi","thú vui | sở thích | ăn chơi trác táng | sa đọa | trụy lạc","a hobby | dissipation | debauchery","1454140"),
    ("胴元","どうもと","n","nhà cái | chủ sòng bạc | kẻ cầm cái | trùm cá cược","a banker (gambling) | a bookmaker","1624060"),
    ("時の氏神","ときのうじがみ","n","vị cứu tinh đúng lúc | người xuất hiện giúp đỡ kịp thời | quý nhân phù trợ","a person who turns up to help at the right moment","2260110"),
    ("度外視","どがいし","n|vs|vt","bỏ qua | không tính tới | phớt lờ | gạt sang một bên","disregarding | taking no account of | ignoring","1616690"),
    ("床屋","とこや","n","tiệm cắt tóc | thợ cắt tóc | hiệu cạo râu","a barbershop | a barber","1349410"),
    ("所構わず","ところかまわず","exp|adv","bất kể chỗ nào | bừa bãi khắp nơi | không kể nơi chốn | tùy tiện","irrespective of the place | indiscriminately","1854600"),
    ("徳俵","とくだわら","n","bao gạo lùi mép sới sumo | vạch lùi đặc biệt trên sới đấu","the bales set slightly back on a sumo ring's edge","2022740"),
    ("研ぎ澄ます","とぎすます","v5s|vt","mài sắc | mài bén | rèn giũa | tôi luyện | làm nhạy bén","to sharpen | to hone | to make keen","1655530"),
    ("咎","とが","n","lỗi | sai lầm | tội | tội lỗi | điều sai trái","a fault | a sin | a wrongdoing","2611400"),
    ("土左衛門","どざえもん","n","xác chết đuối | tử thi trôi sông | người chết đuối","the drowned body of a person","1445330"),
    ("年端","としは","n|adj-no","tuổi tác | số tuổi | độ tuổi (年端もいかない: còn nhỏ tuổi)","age | years (old)","1468980"),
    ("土地勘","とちかん","n","sự thông thuộc địa bàn | hiểu biết về một nơi | rành đường đất","familiarity with the area | local knowledge","1702200"),
    ("怒鳴り込む","どなりこむ","v5m|vi","xông vào quát tháo | ập vào la lối | hùng hổ kéo đến mắng","to storm in with a yell","1848800"),
    ("取り柄","とりえ","n","ưu điểm | điểm mạnh | giá trị | mặt tốt | điểm đáng quý","a merit | a strong point | a redeeming feature","1326920"),
    ("取りなし","とりなし","n","sự hòa giải | đứng ra dàn xếp | nói đỡ | làm dịu","mediation | intercession | smoothing over","1707570"),
    ("取り留め","とりとめ","n","sự mạch lạc | trọng tâm | sự rõ ràng (取り留めのない: lan man vô định)","coherence | order | focus","2834732"),
    ("取り巻き","とりまき","n","đám tùy tùng | kẻ vây quanh | bọn xu nịnh | đám ăn theo","followers | hangers-on","1707670"),
    ("泥棒猫","どろぼうねこ","n","mèo ăn vụng | kẻ thứ ba | kẻ phá hoại gia đình | tiểu tam","a thieving cat | a homewrecker","2162280"),
    ("頓馬","とんま","n|adj-na","đần độn | ngốc nghếch | khờ khạo | đồ ngớ ngẩn","an idiot | a fool | a dope","1713340"),
    ("鳶","とび","n","diều hâu | thợ giàn giáo | lính cứu hỏa | màu nâu đỏ (鳶が鷹を生む)","a black kite | a scaffolding worker","1008670"),
    ("直々","じきじき","adv|adj-no","đích thân | trực tiếp | tận tay | tự mình","in person | personally | directly","1595210"),
    ("名付け親","なづけおや","n","cha mẹ đỡ đầu | người đặt tên | người đặt tên cho","a godparent | a namer","1531800"),
    ("名乗り","なのり","n","sự xưng tên | tự giới thiệu | xưng danh | tự nhận","giving one's name | self-introduction","1531630"),
    ("鯰","なまず","n","cá trê | cá nheo | (truyền thuyết cá gây động đất)","a catfish","1574880"),
    ("生煮え","なまにえ","adj-na|n","nấu chưa chín | tái sống | mập mờ | nửa vời | lập lờ","half-cooked | rare | ambiguous | vague","1379090"),
    ("生半可","なまはんか","adj-na|n","nửa vời | hời hợt | qua loa | nông cạn | thiếu nghiêm túc","superficial | half-hearted | shallow","1829680"),
    ("生身","なまみ","n|adj-no","thân xác phàm | người bằng xương bằng thịt | cơ thể sống | (cá) tươi sống","living flesh | flesh and blood | a living human","1379160"),
    ("鉛色","なまりいろ","n|adj-no","màu chì | màu xám chì | xám xịt","lead color | leaden grey","1178520"),
    ("成れの果て","なれのはて","exp","cái bóng tàn tạ của chính mình | tàn dư | tàn tích | kết cục thê thảm","the mere shadow of one's former self | the ruins of what one was","2126190"),
    ("難癖","なんくせ","n","thói bới móc | bắt bẻ | kiếm chuyện | vạch lá tìm sâu (難癖をつける)","fault-finding | a quibble","1461100"),
    ("何だかんだ","なんだかんだ","adv","này nọ | cái này cái kia | đủ thứ chuyện | thế này thế khác","something or other | one thing or another","1188360"),
    ("南無","なむ","conj|int","nam mô | quy y | kính lễ (Phật) | a-men","amen | hail (Buddhist invocation)","1460640"),
    ("二進","にしん","adj-na|n","nhị phân | hệ cơ số hai","binary","1462420"),
    ("似非","えせ","pref","giả | rởm | giả hiệu | dỏm | trá hình | dởm (似非インテリ)","false | pseudo- | sham | would-be","1314710"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
