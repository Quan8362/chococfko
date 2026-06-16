# -*- coding: utf-8 -*-
"""Build N1 ready wave 015 — 四字熟語 + literary abstract nouns (set 15)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-015.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("一字一句","いちじいっく","n","từng câu từng chữ | nguyên văn | từng chữ một","word for word | verbatim | literally","1727860"),
    ("一言一句","いちごんいっく","n","từng lời từng chữ | từng câu chữ | chi li từng lời","every single word and phrase | word by word","1727900"),
    ("一挙一動","いっきょいちどう","n","nhất cử nhất động | mọi hành động | từng cử chỉ","one's every action | every single move","1161860"),
    ("一心同体","いっしんどうたい","n","đồng tâm hiệp lực | một lòng một dạ | đồng cam cộng khổ","being one in body and soul | two hearts beating as one","1163600"),
    ("意気軒昂","いきけんこう","adj-na|adj-t|adv-to","hăng hái | phấn chấn | khí thế ngút trời","in high spirits | elated","1156440"),
    ("有為転変","ういてんぺん","n|adj-no","vô thường | biến đổi khôn lường | thăng trầm dâu bể","mutability of worldly affairs | fleeting shifts and changes","1541110"),
    ("雲水","うんすい","n","vân du tăng | nhà sư khất thực | mây nước","itinerant priest | wandering monk","1173220"),
    ("栄枯","えいこ","n","thịnh suy | hưng vong | thăng trầm","vicissitudes | ups and downs","1173900"),
    ("盤石","ばんじゃく","n|adj-no|adj-na","vững như bàn thạch | kiên cố | tảng đá lớn","huge rock | firmness | solidity","1601370"),
    ("傍観者","ぼうかんしゃ","n","kẻ bàng quan | người ngoài cuộc | kẻ đứng nhìn","onlooker | bystander","1518810"),
    ("夏炉冬扇","かろとうせん","n","lò sưởi mùa hè quạt mùa đông | thứ vô dụng | đồ thừa thãi","useless things | summer fires and winter fans","1191670"),
    ("我利我利","がりがり","adv|adv-to|adj-na","chỉ chăm chăm một thứ | ích kỷ | vì lợi riêng | cố chấp","obsessively | selfish | self-serving","2833552"),
    ("歓天喜地","かんてんきち","n|adj-no","mừng rỡ vô cùng | hân hoan tột độ | vui sướng ngất ngây","great joy | jubilation | exultation","2113050"),
    ("緩急","かんきゅう","n","nhanh chậm | nhịp độ | khoan nhặt | tình thế nguy cấp","fast and slow | pace | emergency | crisis","1214470"),
    ("閑話休題","かんわきゅうだい","conj","trở lại chủ đề chính | thôi không lan man | gác chuyện ngoài lề","getting back to the subject at hand","1215760"),
    ("危急存亡","ききゅうそんぼう","n","nguy cấp tồn vong | sống còn | thời khắc sinh tử","life-and-death matter | survival crisis","1218530"),
    ("器用貧乏","きようびんぼう","n","đa tài nhưng không tinh | biết nhiều mà không giỏi gì","jack of all trades, master of none","1218970"),
    ("玉石","ぎょくせき","n","ngọc đá lẫn lộn | vàng thau lẫn lộn | tốt xấu lẫn lộn","gems and stones | good and bad mixed","1240610"),
    ("金科玉条","きんかぎょくじょう","n","khuôn vàng thước ngọc | nguyên tắc vàng | kim chỉ nam","golden rule | basic guiding principle","1242670"),
    ("群雄割拠","ぐんゆうかっきょ","n|vs|vi","quần hùng cát cứ | các thế lực tranh hùng | sứ quân nổi dậy","rivalry of local warlords","1247640"),
    ("鶏鳴","けいめい","n","gà gáy | tiếng gà gáy | tảng sáng | rạng đông","crowing of a cock | cockcrow | dawn","1253030"),
    ("牽強付会","けんきょうふかい","adj-no|n|vs|vt","gượng ép | khiên cưỡng | suy diễn gò ép | lý lẽ cùn","strained (argument) | farfetched | forced reasoning","1258280"),
    ("捲土重来","けんどちょうらい","n|vs|vi","cuốn đất trở lại | gượng dậy phản công | quyết tâm làm lại","making another attempt with redoubled efforts","2040390"),
    ("孤軍奮闘","こぐんふんとう","n|vs","đơn thương độc mã | chiến đấu một mình | tự lực gắng sức","fighting alone","1843290"),
    ("虎視眈々","こしたんたん","adv-to|adj-t","hổ rình mồi | rình rập cơ hội | hau háu chờ thời","vigilantly watching for an opportunity | with an eagle eye","1593230"),
    ("広範","こうはん","adj-na|adj-no","rộng khắp | bao quát | sâu rộng | trên diện rộng","wide | extensive | comprehensive | far-reaching","1278660"),
    ("巧言令色","こうげんれいしょく","n","khéo mồm xu nịnh | lời ngọt vẻ tươi | nịnh hót lấy lòng","flattery | honeyed words","1278310"),
    ("公序良俗","こうじょりょうぞく","n","thuần phong mỹ tục | trật tự công cộng và đạo đức xã hội","public order and morals | social standards","1677050"),
    ("至誠","しせい","n","chí thành | hết lòng | chân thành tột bậc | tận tụy","sincerity | devotion","1647240"),
    ("時運","じうん","n","vận thời | thời vận | xu thế thời cuộc","tide of the times","1816580"),
    ("舌先三寸","したさきさんずん","n","ba tấc lưỡi | tài ăn nói lừa người | khéo mồm dối trá","eloquence or flattery designed to deceive","1788090"),
    ("四分五裂","しぶんごれつ","n|vs|vi","chia năm xẻ bảy | tan tác | rối loạn phân rã","torn asunder | disrupted and disorganized","1307350"),
    ("熟読玩味","じゅくどくがんみ","n|vs|vt","đọc kỹ ngẫm sâu | đọc đi đọc lại thưởng thức | nghiền ngẫm","reading carefully with appreciation","2031270"),
    ("順境","じゅんきょう","n","hoàn cảnh thuận lợi | thời thuận | sung túc","favorable circumstances | prosperity","1342300"),
    ("心機一転","しんきいってん","n|vs|vi","đổi mới tâm trạng | làm lại từ đầu | thay đổi tâm thế","turning over a new leaf | getting a fresh start","1793810"),
    ("信賞必罰","しんしょうひつばつ","n","thưởng phạt phân minh | có công thưởng có tội phạt","rewarding good and punishing evil","1813220"),
    ("清廉潔白","せいれんけっぱく","n|adj-na","liêm khiết trong sạch | thanh liêm chính trực | trong sạch tuyệt đối","spotless integrity | absolute honesty","1378430"),
    ("晴耕雨読","せいこううどく","n|vs|vi","tạnh cày mưa đọc | sống ẩn dật điền viên | an nhàn cày cấy đọc sách","living in quiet retirement (farming and reading)","1376540"),
    ("切磋","せっさ","n|vs","mài giũa | dùi mài | rèn luyện bản thân | trau dồi","working hard | applying oneself | cultivating oneself","1385240"),
    ("千客万来","せんきゃくばんらい","n","khách khứa nườm nượp | buôn may bán đắt | đông khách","flood of customers | roaring business","1581010"),
    ("創意工夫","そういくふう","n","sáng tạo và khéo léo | óc sáng kiến | tìm tòi đổi mới","ingenuity | inventiveness | creative originality","2031760"),
    ("相互扶助","そうごふじょ","n","tương trợ lẫn nhau | giúp đỡ qua lại","mutual aid","1748860"),
    ("大言壮語","たいげんそうご","n|vs|vi|adj-no","khoác lác | nói phách | huênh hoang | ba hoa","big talk | boasting | bragging","1413620"),
    ("大山鳴動","たいざんめいどう","n|vs|vi","núi lớn rung chuyển (chuột con) | thùng rỗng kêu to | đầu voi đuôi chuột","much ado about nothing | big fuss over nothing","2031840"),
    ("多岐亡羊","たきぼうよう","n","đường rẽ lạc dê | nhiều lựa chọn khó quyết | chân lý khó tìm","too many options making selection difficult","2031820"),
    ("多事多端","たじたたん","adj-na|n","trăm công nghìn việc | bận rộn tíu tít | đa đoan","eventfulness | pressure of business","1407710"),
    ("他力本願","たりきほんがん","n","dựa vào tha lực | ỷ lại người khác | trông cậy bên ngoài","relying on others | salvation by faith in Amitabha","1407440"),
    ("朝三暮四","ちょうさんぼし","n","sáng ba chiều bốn | đánh tráo khái niệm | bịp bợm bằng tiểu xảo","being deceived by superficial differences","1428360"),
    ("沈思黙考","ちんしもっこう","exp","trầm tư mặc tưởng | suy nghĩ sâu lắng | nghiền ngẫm lặng lẽ","being lost in deep thought","1431720"),
    ("通暁","つうぎょう","n|vs","tinh thông | am hiểu tường tận | thông thạo","well versed | thorough knowledge","1433130"),
    ("低迷","ていめい","n|vs|vi","ảm đạm | trì trệ | lình xình | (mây) giăng thấp","remaining sluggish | slump | hanging low (clouds)","1434730"),
    ("天涯孤独","てんがいこどく","n","cô độc nơi chân trời | không người thân thích | bơ vơ một mình","a person without a single relative","1438610"),
    ("桃源郷","とうげんきょう","n","đào nguyên | chốn bồng lai | thiên đường nơi trần thế","earthly paradise | Shangri-la","1448310"),
    ("内剛","ないごう","n","nội tâm cứng cỏi | kiên cường bên trong | ngoài mềm trong cứng","tough at heart","1791980"),
    ("難攻不落","なんこうふらく","n|adj-no","kiên cố bất khả xâm phạm | khó công khó hạ | thành trì vững chắc","impregnable","1460940"),
    ("二者択一","にしゃたくいつ","n|adj-no","chọn một trong hai | nhị nguyên | hai đường một lối","choosing between two things | two choices","1461960"),
    ("日和見","ひよりみ","n|vs","cơ hội chủ nghĩa | chờ thời | nước đôi | xem chiều gió","opportunism | sitting on the fence","1464960"),
    ("博覧強記","はくらんきょうき","n","học rộng nhớ dai | uyên bác trí nhớ tốt | thông kim bác cổ","encyclopedic knowledge and strong memory","1474760"),
    ("波及効果","はきゅうこうか","n","hiệu ứng lan tỏa | tác động dây chuyền | hiệu ứng lan truyền","ripple effect | spillover effect","2051920"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
