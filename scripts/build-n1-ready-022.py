# -*- coding: utf-8 -*-
"""Build N1 ready wave 022 — literary/formal Sino-Japanese nouns (set 22)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-022.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("嘱望","しょくぼう","n|vs|vt","kỳ vọng | đặt nhiều hy vọng | trông cậy | mong đợi","having great hopes for | pinning one's hopes on","1357150"),
    ("触発","しょくはつ","n|vs|vi|vt","kích hoạt | khơi gợi | châm ngòi | làm bùng phát | gợi cảm hứng","triggering | sparking | provocation | inspiration","1358080"),
    ("食言","しょくげん","n|vs|vi","nuốt lời | thất hứa | bội tín | lật lọng","eat one's words | break one's promises","1839540"),
    ("所感","しょかん","n","cảm tưởng | suy nghĩ | cảm nghĩ | ý kiến","impressions | thoughts | feelings","1343180"),
    ("書評","しょひょう","n","bài điểm sách | bình luận sách | phê bình sách","book review","1344140"),
    ("所以","ゆえん","n","lý do | nguyên do | căn cứ | duyên cớ","reason | grounds","1343130"),
    ("所望","しょもう","n|vs|vt|adj-no","mong muốn | yêu cầu | nguyện vọng | thỉnh cầu","desire | wish | request","1343380"),
    ("親炙","しんしゃ","n|vs|vi","gần gũi cảm hóa | thân cận chịu ảnh hưởng | thụ giáo gần gũi","being influenced through close association","1720810"),
    ("深更","しんこう","n","đêm khuya | nửa đêm | canh khuya | đêm hôm khuya khoắt","middle of the night | dead of night","1646880"),
    ("心緒","しんしょ","n","tâm tư | tâm trạng | nỗi lòng | cảm xúc","emotion | mind","1647020"),
    ("寝食","しんしょく","n|vs","ăn ngủ | sinh hoạt thường nhật | miếng ăn giấc ngủ","bed and food | eating and sleeping","1360160"),
    ("進捗","しんちょく","n|vs|vi","tiến độ | tiến triển | đà tiến | bước tiến","progress | advance | making progress","1366140"),
    ("辛苦","しんく","n|vs|vi","gian khổ | vất vả | cay đắng | cực nhọc","hardship | toil | trouble","1365890"),
    ("深長","しんちょう","adj-na|n","sâu sắc | thâm thúy | hàm súc (意味深長)","profound","1769020"),
    ("信憑","しんぴょう","n|vs","sự tin cậy | độ tin tưởng | đáng tin (信憑性)","trust | credit | credence","1359780"),
    ("推参","すいさん","n|vs|vi|adj-na","đến thăm đường đột | tự ý ghé qua | mạo muội | hỗn xược","calling on uninvited | presumptuous | impertinent","1712960"),
    ("垂涎","すいぜん","n|vs|vi","thèm thuồng | thèm nhỏ dãi | khao khát | thèm muốn","avid desire | craving | watering at the mouth","1371050"),
    ("出納","すいとう","n|vs|vt","thu chi | xuất nhập (tiền) | sổ thu chi","receipts and expenditure","1339950"),
    ("水泡","すいほう","n","bọt nước | công cốc | tan thành mây khói (水泡に帰す)","foam | bubble | nothing","1372070"),
    ("枢要","すうよう","adj-na|adj-no|n","trọng yếu | then chốt | cốt yếu | chủ chốt","most important | pivotal | key | cardinal","1373380"),
    ("趨勢","すうせい","n","xu thế | xu hướng | chiều hướng | trào lưu","tendency | trend","1373390"),
    ("寸鉄","すんてつ","n","binh khí nhỏ | lời châm biếm sắc bén | câu nói sâu cay (寸鉄人を刺す)","short blade | epigram | pithy saying","1653780"),
    ("精悍","せいかん","adj-na|n","rắn rỏi | mạnh mẽ | gân guốc | sắc sảo dữ dằn","virile | tough | sharp (features) | dauntless","1751260"),
    ("清楚","せいそ","adj-na|n","thanh khiết | gọn gàng sạch sẽ | trang nhã | tinh tươm","neat and clean | tidy | trim","1616090"),
    ("清澄","せいちょう","adj-na|n","trong vắt | thanh khiết | thanh tịnh | trong trẻo","clear | serene","1378310"),
    ("盛者","しょうじゃ","n","người hưng thịnh | kẻ quyền thế | người thịnh vượng (盛者必衰)","prosperous person | powerful person","1663570"),
    ("跫音","きょうおん","n","tiếng bước chân | âm thanh bước chân","sound of footsteps","2868707"),
    ("斥候","せっこう","n|vs|vt","trinh sát | do thám | thám báo | lính trinh sát","scout | patrol | spy","1382330"),
    ("折半","せっぱん","n|vs|vt","chia đôi | chia đều | cưa đôi | san sẻ ngang nhau","halving | splitting evenly","1385980"),
    ("僭主","せんしゅ","n","kẻ tiếm quyền | bạo chúa | kẻ soán ngôi","usurper | tyrant","1564060"),
    ("潜行","せんこう","n|vs|vi","ngầm hoạt động | đi ngầm | hoạt động bí mật | trốn chui lủi","going underground | going into hiding | travelling incognito","1618960"),
    ("専横","せんおう","n|adj-na","chuyên quyền | độc đoán | hống hách | lộng quyền","arbitrariness | despotism | high-handedness","1389750"),
    ("浅学","せんがく","n|adj-no","học thức nông cạn | kiến thức hời hợt | tài hèn học ít","shallow knowledge | superficial learning","1390830"),
    ("詮索","せんさく","n|vs|vt","dò xét | tọc mạch | soi mói | điều tra kỹ","prying into | investigation | exploration","1392130"),
    ("僭上","せんじょう","n|adj-na","quá phận | vượt mặt | hỗn láo | lộng hành","audacity | effrontery | impertinence","1564090"),
    ("扇情","せんじょう","n|vs|vt|vi","khêu gợi | kích động cảm xúc | giật gân | khơi dậy dục vọng","stirring up strong emotions | sensationalism | arousal","1390740"),
    ("象牙","ぞうげ","n","ngà voi","ivory","1351840"),
    ("痩躯","そうく","n|adj-no","thân hình gầy | dáng mảnh khảnh | vóc gầy gò","lean figure | slender figure","1835410"),
    ("壮図","そうと","n","kế hoạch lớn | đại sự | hoài bão lớn lao","ambitious undertaking | grand scheme","1660880"),
    ("相伝","そうでん","n|vs|vt","gia truyền | truyền nối | thừa kế đời nối đời","inheritance (handing down)","1660600"),
    ("増長","ぞうちょう","n|vs|vi","sinh hư | tự cao tự đại | làm tới | càng thêm trầm trọng","growing impudent | becoming arrogant | increasing","1403330"),
    ("草莽","そうもう","n","thảo dân | dân thường | kẻ sĩ tại dã | bụi cỏ","commoner | humble subject | grassy place","2773780"),
    ("惻隠","そくいん","n","trắc ẩn | lòng thương xót | lòng từ bi | thương cảm","compassion | pity","2509910"),
    ("遜色","そんしょく","n","sự thua kém | sự kém cỏi | (遜色ない: không hề thua kém)","inferiority","1406870"),
    ("大言","たいげん","n|vs|vi","nói phách | khoác lác | nói lớn lối | huênh hoang","big talk | braggadocio","2644720"),
    ("高言","こうげん","n|vs|vt|vi","khoe khoang | ba hoa | nói khoác | nói phách","boasting | bragging | talking big","1664920"),
    ("卓識","たくしき","n","tầm nhìn sáng suốt | kiến giải xuất sắc | nhãn quan sâu sắc","clearsightedness | penetration | excellent idea","1415640"),
    ("打擲","ちょうちゃく","n|vs|vt","đánh đập | đòn roi | thượng cẳng chân hạ cẳng tay","thrashing | beating","1776730"),
    ("惰弱","だじゃく","adj-na|n","bạc nhược | uể oải | nhu nhược | ẻo lả yếu đuối","apathetic | indolent | weak-willed | feeble","1704450"),
    ("殺陣","たて","n","cảnh đấu kiếm (phim, kịch) | màn giao đấu | cảnh đánh nhau","sword fight (in a film/play) | fight scene","1299150"),
    ("谷間","たにま","n","thung lũng | khe núi | hẻm núi | khe ngực | nơi bị bỏ quên","valley | ravine | cleavage | place left behind","1416740"),
    ("他聞","たぶん","n","lọt tai người khác | bị người ngoài nghe thấy | tai tiếng","reaching others' ears | publicity","1407360"),
    ("耽美","たんび","n","duy mỹ | tôn thờ cái đẹp | đắm say cái đẹp | thẩm mỹ chủ nghĩa","aestheticism | pursuit of beauty","1768690"),
    ("端正","たんせい","adj-na|n","đoan trang | ngay ngắn | tề chỉnh | chỉn chu","handsome | shapely | decent | upright","1418910"),
    ("痴情","ちじょう","n","si tình | mê muội vì tình | tình cảm mù quáng | ghen tuông","foolish passion | blind love | infatuation | jealousy","1421720"),
    ("逐電","ちくでん","n|vs|vi","cao chạy xa bay | bỏ trốn | trốn biệt tăm","flight | absconding","1422510"),
    ("知悉","ちしつ","n|vs|vt","thông tỏ | am hiểu tường tận | nắm rõ mọi điều | thấu suốt","having complete knowledge | knowing thoroughly","1800260"),
    ("嫡子","ちゃくし","n","con trưởng | con chính thất | người thừa kế | đích tử","heir | legitimate child","1422910"),
    ("昼餉","ひるげ","n","bữa trưa | cơm trưa | bữa ăn giữa ngày","lunch | midday meal","2863031"),
    ("寵児","ちょうじ","n","con cưng | đứa con được sủng ái | ngôi sao | người được yêu thích","favorite child | darling | star","1699920"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
