# -*- coding: utf-8 -*-
"""Build N1 ready wave 045 — formal/colloquial nouns + 慣用句 (set 45)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-045.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("音頭","おんど","n","người xướng (hô, hát) | điệu múa hát tập thể | người dẫn nhịp (音頭を取る)","leading (a cheer, toast) | a group folk dance","1183980"),
    ("盗み足","ぬすみあし","n","bước chân rón rén | đi nhẹ lén lút | rón rén","stealthy steps","1773900"),
    ("塗り絵","ぬりえ","n","tranh tô màu | tranh để tô màu","a picture for coloring in","1444210"),
    ("寝入りばな","ねいりばな","n","lúc vừa thiếp đi | khoảnh khắc mới chợp mắt | vừa mới ngủ","the moment just after falling asleep","1792790"),
    ("願掛け","がんかけ","n|vs|vi","khấn nguyện | cầu khấn | lập lời nguyện (với thần Phật)","making a prayer (to a god or Buddha)","1218020"),
    ("寝相","ねぞう","n","tư thế ngủ | dáng ngủ | kiểu ngủ (寝相が悪い: ngủ lăn lộn)","one's sleeping posture","1611110"),
    ("根強い","ねづよい","adj-i","ăn sâu | bám rễ | thâm căn cố đế | dai dẳng | bền chặt","firmly rooted | deep-seated","1290150"),
    ("熱り","ほとぼり","n","hơi nóng còn lại | dư âm | sự sôi sục còn vương | tàn nhiệt (熱りが冷める)","remaining heat | lingering public excitement","2063330"),
    ("寝ても覚めても","ねてもさめても","exp","thức hay ngủ | mọi lúc | suốt ngày đêm | lúc nào cũng","waking or sleeping | constantly | at all times","2403920"),
    ("狙い目","ねらいめ","n","thời cơ | cơ hội tốt | điểm nhắm | mục tiêu nhắm tới","one's chance | the right time | the target","2522030"),
    ("年季","ねんき","n","kỳ hạn học việc | thời gian rèn nghề | tay nghề tích lũy (年季が入る)","an apprenticeship period | accumulated experience","1468460"),
    ("念書","ねんしょ","n","giấy cam kết | giấy cam đoan | bản ghi nhớ | văn bản đảm bảo","a written pledge | a signed note of assurance","1469430"),
    ("野垂れ死に","のたれじに","n|vs|vi","chết đầu đường xó chợ | chết bờ chết bụi | bỏ mạng nơi vệ đường","dying by the roadside | dying a dog's death","1711960"),
    ("延べ","のべ","n|pref","tổng cộng | tổng gộp | bán chịu | dát mỏng | lũy kế","total | aggregate | gross | credit buying","1176380"),
    ("上り坂","のぼりざか","n","dốc lên | đường dốc lên | đà đi lên | thời kỳ thịnh","an uphill slope | an upturn","1352540"),
    ("飲み込み","のみこみ","n","sự nuốt | sự lĩnh hội | khả năng tiếp thu | sự hiểu (飲み込みが早い)","swallowing | comprehension | apprehension","1600390"),
    ("能書","のうしょ","n","tài thư pháp | nét chữ đẹp | bút pháp tài hoa","excellent calligraphy","1470180"),
    ("量り売り","はかりうり","n|vs|vt","bán theo cân | bán theo khối lượng | bán theo định lượng | cân ký","selling by weight or measure","1625820"),
    ("歯切れ","はぎれ","n","cảm giác cắn | cách phát âm | sự rành mạch (歯切れがいい: rõ ràng dứt khoát)","the feel when biting | manner of enunciation","1313410"),
    ("端くれ","はしくれ","n","mẩu vụn | kẻ tép riu | tuy không ra gì nhưng cũng là... | hạng quèn","a scrap | an unimportant person | ... in name only","1626320"),
    ("橋渡し","はしわたし","n|vs|vi","cầu nối | trung gian | làm mối | bắc cầu | người dàn xếp","mediation | a go-between | building a bridge","1237440"),
    ("裸馬","はだかうま","n|adj-no","ngựa không yên | ngựa trần | cưỡi ngựa không yên","an unsaddled horse","1547690"),
    ("旗色","はたいろ","n","cục diện | tình thế | phe phái | lập trường (旗色が悪い: thế bất lợi)","the situation | the outlook | one's allegiance","1220270"),
    ("畑違い","はたけちがい","adj-no|n","trái ngành | ngoài chuyên môn | khác lĩnh vực | không cùng nghề","outside one's field | out of one's line","1476530"),
    ("肌身","はだみ","n","thân thể | cơ thể | người (肌身離さず: luôn mang bên người)","one's body","1625450"),
    ("破竹","はちく","n","chẻ tre | thế chẻ tre | như chẻ tre (破竹の勢い: khí thế như chẻ tre)","breaking bamboo | irresistible momentum","1681490"),
    ("初耳","はつみみ","n","lần đầu nghe | nghe lần đầu | mới nghe lần đầu | chuyện mới toanh","something heard for the first time","1342770"),
    ("鼻先","はなさき","n","đầu mũi | trước mũi | ngay trước mắt | sát mặt | mỏm (鼻先で笑う)","the tip of the nose | right in front of one","1487070"),
    ("花形","はながた","n|adj-no","ngôi sao | gương mặt nổi bật | nhân vật ăn khách | họa tiết hoa","a star (actor, player) | a floral pattern","1194640"),
    ("甚だ","はなはだ","adv","vô cùng | hết sức | cực kỳ | quá đỗi | rất","very | greatly | exceedingly | extremely","1370000"),
    ("鼻持ち","はなもち","n","sự chịu đựng mùi (鼻持ちならない: không chịu nổi)","toleration of an odour","2865123"),
    ("歯向かう","はむかう","v5u|vi","chống lại | phản kháng | đối đầu | cãi lại | nổi loạn","to strike back at | to oppose | to defy","1601070"),
    ("張り合い","はりあい","n","sự ganh đua | sự đối địch | động lực | sự đáng công sức (張り合いがない)","rivalry | motivation | something worth the effort","1797920"),
    ("波風","なみかぜ","n","sóng gió | gió và sóng | bất hòa | rắc rối | gian truân (波風が立つ)","wind and waves | discord | trouble","1771490"),
    ("腫れ物","はれもの","n","mụn nhọt | chỗ sưng | u nhọt | ung nhọt (腫れ物に触るよう: nâng niu thận trọng)","a swelling | a boil | an abscess","1686470"),
    ("半可","はんか","adj-na|n","nửa vời | chưa chín | thiếu sót | hời hợt (生半可)","insufficiency | half-ripe","1478940"),
    ("半玉","はんぎょく","n","geisha tập sự | đào nhỏ | geisha học việc","a geisha apprentice","1479190"),
    ("半畳","はんじょう","n","nửa chiếu tatami | sự la ó chế giễu | chen ngang chê bai (半畳を入れる)","half a tatami mat | heckling | jeering","1479450"),
    ("万障","ばんしょう","n","mọi trở ngại | mọi vướng mắc | tất cả cản trở (万障お繰り合わせ)","all hindrances | all obstacles","1526120"),
    ("判子","はんこ","n","con dấu | con triện | dấu cá nhân (thay chữ ký)","a seal | a stamp (used in lieu of a signature)","1478550"),
    ("反吐","へど","n","nôn mửa | ói | sự buồn nôn (反吐が出る: phát tởm)","vomit | vomiting","1480780"),
    ("非業","ひごう","n|adj-na","cái chết oan ức | chết bất đắc kỳ tử | chết thảm | yểu mệnh (非業の死)","an unnatural or untimely death","1688850"),
    ("膝枕","ひざまくら","n","gối đầu lên đùi | dùng đùi làm gối | nằm gối đùi","laying one's head in someone's lap","1721940"),
    ("菱形","ひしがた","n|adj-no","hình thoi | hình quả trám | hình kim cương","a rhombus | a lozenge | a diamond shape","1487370"),
    ("火種","ひだね","n","than mồi | củi lửa | mầm mống (xung đột) | ngòi nổ | nguyên nhân gây sự","live coals | the cause of a conflict | a trigger","1193980"),
    ("左利き","ひだりきき","n|adj-no","thuận tay trái | người tay trái | người thích rượu","left-handedness | a left-hander | a drinker","1601860"),
    ("筆舌","ひつぜつ","n","lời nói và chữ viết | bút mực | sự diễn tả (筆舌に尽くしがたい: khó tả xiết)","written and spoken words | description","1731950"),
    ("人並み","ひとなみ","adj-no|adj-na|n","bình thường | như mọi người | trung bình | tầm thường | như bao người","ordinary | average | like most people","1601970"),
    ("人払い","ひとばらい","n|vs|vi","đuổi người ra ngoài | dẹp người ra | bảo mọi người lui ra","clearing people out of a room","1369060"),
    ("人寄せ","ひとよせ","n","sự thu hút người | việc câu khách | điểm hút khách","attracting people | a draw","1367000"),
    ("皮肉屋","ひにくや","n","kẻ hay mỉa mai | người châm biếm | kẻ cay nghiệt | tay châm chọc","an ironist | a sarcastic person","2812620"),
    ("火の見","ひのみ","n","chòi canh lửa | tháp canh hỏa hoạn | đài quan sát cháy","a fire watchtower","1193640"),
    ("非番","ひばん","n|adj-no","ngoài ca trực | không phải phiên trực | nghỉ ca | ngày nghỉ trực","being off duty","1626590"),
    ("百日紅","さるすべり","n","cây tường vi | cây bằng lăng | cây tử vi (hoa)","the crape myrtle","1488370"),
    ("火宅","かたく","n","cõi trần khổ ải | nhà lửa (Phật giáo) | cõi đời đầy đau khổ","this world of suffering (Buddhism)","1194130"),
    ("比翼","ひよく","n","sánh đôi (chim liền cánh) | gắn bó keo sơn | áo may giả hai lớp (比翼連理)","wings abreast | an inseparable couple","1627060"),
    ("昼日中","ひるひなか","exp|n|adv","giữa ban ngày | giữa thanh thiên bạch nhật | ban ngày ban mặt","broad daylight | noon","1426400"),
    ("便箋","びんせん","n","giấy viết thư | giấy thư | giấy nháp viết thư","writing paper | stationery","1512640"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
