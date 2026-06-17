# -*- coding: utf-8 -*-
"""Build N1 ready wave 062 — literary verbs + 漢語 (set 62)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-062.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("論う","あげつらう","v5u|vt","bới móc | bắt bẻ | vạch lỗi | đem ra mổ xẻ chỉ trích","to find fault with | to criticize | to discuss","1000280"),
    ("肖る","あやかる","v5r|vi","hưởng lây may mắn | noi gương | ăn theo | được thơm lây | đặt tên theo","to share someone's good luck | to follow someone's example","1351450"),
    ("誂える","あつらえる","v1|vt","đặt làm | đặt may | đặt hàng theo yêu cầu | đặt riêng","to place an order | to have made to order","1572680"),
    ("能う","あたう","v5u|vi","có thể | làm được | có khả năng (能う限り: hết khả năng)","to be able to | to be capable of","2825914"),
    ("膾炙","かいしゃ","n|vs|vi","được truyền tụng | nổi tiếng khắp nơi | quen thuộc với mọi người (人口に膾炙)","becoming well-known | becoming common knowledge","1571140"),
    ("託ける","かこつける","v1|vi","viện cớ | lấy cớ | mượn cớ | đổ thừa | vin vào","to use as a pretext | to use as an excuse","1415890"),
    ("託つ","かこつ","v5t|vt","than vãn | ca thán | phàn nàn | oán trách | càu nhàu","to complain about | to grumble about | to bemoan","1415880"),
    ("誑かす","たぶらかす","v5s|vt","lừa gạt | dụ dỗ | đánh lừa | mê hoặc | gạt gẫm","to trick | to deceive | to seduce","1572700"),
    ("畏まる","かしこまる","v5r|vi","cung kính vâng dạ | ngồi nghiêm trang | khúm núm kính cẩn | dạ vâng","to obey respectfully | to sit upright respectfully","1157440"),
    ("傅く","かしずく","v5k|vi","hầu hạ | phục dịch | hầu cận | chăm sóc tận tụy","to wait upon | to serve","1563890"),
    ("鑑みる","かんがみる","v1|vt|vi","cân nhắc | xét đến | soi xét | lấy làm gương | đối chiếu (現状に鑑みて)","to take into account | to consider | to learn from","1215170"),
    ("慮る","おもんばかる","v5r|vt","suy xét kỹ | cân nhắc thấu đáo | nghĩ trước nghĩ sau | lo xa","to consider carefully | to deliberate thoroughly","1553100"),
    ("誅する","ちゅうする","vs-s|vt","tru diệt | xử tử | giết để trừng phạt | hành quyết (kẻ phản nghịch)","to put to death | to punish with death","2662940"),
    ("燻らす","くゆらす","v5s|vt","nhả khói | phì phèo (thuốc) | đốt (hương) | làm tỏa khói","to puff (a cigarette) | to burn (incense)","1569050"),
    ("誣いる","しいる","v1|vt","vu khống | vu oan | buộc tội sai | đặt điều hãm hại","to slander | to accuse falsely","1572740"),
    ("論ずる","ろんずる","vz|vt","bàn luận | tranh luận | đề cập | lý sự | đưa ra bàn cãi","to discuss | to argue | to deal with (a topic)","1561640"),
    ("講ずる","こうずる","vz|vt","giảng giải | thuyết giảng | nghĩ ra (kế) | áp dụng (biện pháp) (対策を講ずる)","to lecture | to devise | to take (measures)","1631450"),
    ("詠む","よむ","v5m|vt","làm thơ | sáng tác thơ | ngâm thơ | vịnh | xướng họa","to compose (a poem) | to recite | to chant","1174820"),
    ("窘める","たしなめる","v1|vt","trách móc nhẹ nhàng | khiển trách | quở nhẹ | nhắc nhở răn dạy","to chide | to rebuke | to reprove","1570200"),
    ("誂え","あつらえ","n|adj-no","hàng đặt làm | đồ đặt riêng | đặt may đo (誂え向き: vừa ý)","an order | a made-to-order article","2034860"),
    ("化ける","ばける","v1|vi","biến hình | hóa thành | giả dạng | cải trang | lột xác bất ngờ","to transform | to disguise oneself | to change dramatically","1186710"),
    ("吝かでない","やぶさかでない","exp|adj-i","sẵn lòng | không ngần ngại | vui lòng | sẵn sàng làm","ready (to do) | willing","2017970"),
    ("弄する","ろうする","vs-s","giở trò | dùng (mưu mẹo, ngụy biện) | bày trò | đùa cợt | giễu cợt (策を弄する)","to use (a trick) | to play with | to deride","1560680"),
    ("戦慄く","わななく","v5k|vi","run rẩy | run lập cập | rùng mình | run lẩy bẩy","to tremble | to shiver | to shake","1390700"),
    ("托鉢","たくはつ","n|vs","khất thực | đi xin của bố thí | hành khất (nhà sư)","religious mendicancy | a monk's begging","1415800"),
    ("醸し出す","かもしだす","v5s|vt","tạo ra (bầu không khí) | gợi nên | toát lên | làm dậy lên (cảm giác)","to create (an atmosphere) | to engender","1357060"),
    ("徒桜","あだざくら","n","hoa anh đào chóng tàn | điều phù du | người phụ nữ phụ bạc | sự phù phiếm","ephemeral cherry blossom | a fleeting thing","1654170"),
    ("詠ずる","えいずる","vz|vt","ngâm vịnh | sáng tác thơ | ngâm nga | xướng thơ","to compose (a poem) | to recite | to chant","2462970"),
    ("僭する","せんする","vs-s|vt","tiếm đoạt | tự xưng càn | mạo nhận ngôi vị | lộng quyền","to usurp boastfully","1564020"),
    ("凌ぐ","しのぐ","v5g|vt","chống chịu | cầm cự | vượt qua | hơn hẳn | che chắn (寒さを凌ぐ)","to endure | to stave off | to surpass | to outdo","1554200"),
    ("詠嘆","えいたん","n|vs|vi","cảm thán | thán phục | trầm trồ | xuýt xoa ngợi ca","exclamation | admiration","1588670"),
    ("論告求刑","ろんこくきゅうけい","n","luận tội và đề nghị mức án | cáo trạng và đề xuất hình phạt (công tố)","closing argument and sentencing recommendation","2002070"),
    ("論陣","ろんじん","n","thế trận lập luận | hệ thống luận điểm | bài binh bố trận tranh luận (論陣を張る)","the construction of an argument","1738710"),
    ("論定","ろんてい","n|vs","bàn bạc quyết định | luận bàn ngã ngũ | thảo luận đi đến kết luận","discussing and deciding","1738690"),
    ("詭弁を弄する","きべんをろうする","exp|vs-s","ngụy biện | dùng lý lẽ xảo trá | lý sự cùn | bẻ cong sự thật","to use sophistry","2103120"),
    ("利他","りた","n","vị tha | lợi tha | sống vì người khác | lòng vị tha","altruism","1549610"),
    ("理財","りざい","n","quản lý tài chính | lý tài | kinh tế tài chính | việc tiền nong","finance | economy","1795800"),
    ("利殖","りしょく","n|vs|vi|adj-no","sinh lời | đầu tư kiếm lãi | làm tiền đẻ tiền | gia tăng tài sản","money-making | making one's money grow","1549590"),
    ("律する","りっする","vs-s","đánh giá theo chuẩn | tự kiểm soát | kỷ luật bản thân | quy định | điều chỉnh","to judge by | to discipline (oneself) | to regulate","2256610"),
    ("俚耳","りじ","n","tai dân chúng | sự nghe của quần chúng (俚耳に入る: lọt tai dân chúng)","the ears of the public","1563410"),
    ("流刑","りゅうけい","n|vs","lưu đày | đày biệt xứ | trục xuất | phát vãng","exile | banishment | deportation","1552270"),
    ("流言","りゅうげん","n","tin đồn thất thiệt | lời đồn vô căn cứ | tin nhảm","a groundless rumor","1835040"),
    ("流言飛語","りゅうげんひご","n","tin đồn nhảm nhí | lời đồn bay khắp nơi | tin vịt lan truyền | thị phi đồn đại","false rumors | groundless gossip","1552300"),
    ("流連","りゅうれん","n|vs|vi","la cà chơi bời thâu đêm | ăn dầm nằm dề (chốn ăn chơi) | lưu luyến không về","staying out (e.g. at a brothel)","1835070"),
    ("燎原","りょうげん","n","đốt đồng | đốt cháy cánh đồng | thế lửa cháy lan (燎原の火: như lửa đồng)","setting a field ablaze","2177160"),
    ("寮母","りょうぼ","n","bảo mẫu ký túc xá | mẹ nuôi nhà trọ | quản lý nữ ký túc","a housemother | a dorm mother","1554260"),
    ("僚友","りょうゆう","n","đồng nghiệp | bạn đồng sự | đồng liêu | chiến hữu","a colleague | a comrade","1553400"),
    ("凛冽","りんれつ","adj-na|adj-t|adv-to","rét buốt | lạnh thấu xương | giá buốt | rét căm căm","biting (cold) | piercing | severe","1606360"),
    ("累進","るいしん","n|vs|vi","thăng tiến dần | tăng lũy tiến | tăng dần từng bậc | tiến từng nấc (累進課税)","successive promotion | progressive increase","1556000"),
    ("縲絏","るいせつ","n","dây trói tù nhân | sự giam cầm | cảnh tù tội | xiềng xích lao ngục","being bound in prison","2174820"),
    ("塁壁","るいへき","n","lũy thành | tường thành | bờ lũy phòng thủ | thành lũy","a rampart","1738550"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
