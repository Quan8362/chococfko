# -*- coding: utf-8 -*-
"""Build N1 ready wave 063 — literary verbs (set 63)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-063.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("圧する","あっする","vs-s","đè nén | áp chế | áp đảo | lấn át | chèn ép","to press | to oppress | to overwhelm","1152930"),
    ("肯んじる","がえんじる","v1","ưng thuận | đồng ý | chấp nhận | bằng lòng | gật đầu","to consent | to accept | to agree","2832748"),
    ("忌み嫌う","いみきらう","v5u|vt","ghê tởm | căm ghét | gớm ghiếc | kinh tởm | ghét cay ghét đắng","to detest | to abhor | to loathe","1850320"),
    ("弄くる","いじくる","v5r|vt","mân mê | nghịch ngợm | táy máy | mày mò | sửa lung tung","to fiddle with | to tinker with | to toy with","2007290"),
    ("嘶く","いななく","v5k|vi","hí (ngựa) | ngựa hí | hí vang","to neigh","1000885"),
    ("弥栄","いやさか","n|int","thịnh vượng | phồn vinh | muôn năm | vạn tuế | chúc hưng thịnh","prosperity | flourishing | hurray","2569560"),
    ("卑しめる","いやしめる","v1|vt","khinh miệt | coi thường | hạ nhục | xem rẻ | làm nhục","to demean | to despise | to treat with contempt","1482680"),
    ("彩る","いろどる","v5r|vt","tô màu | điểm tô | trang trí | tô điểm | làm rực rỡ","to colour | to decorate | to adorn","1294400"),
    ("鋳る","いる","v1|vt","đúc | đúc (kim loại) | đúc tiền | luyện đúc","to cast | to mint | to coin","1587780"),
    ("弛む","たるむ","v5m|vi","chùng | lỏng | trễ xuống | võng | lơ là | uể oải","to slacken | to droop | to sag | to slack off","1421580"),
    ("倦む","あぐむ","v5m|vi","chán nản | mệt mỏi | mất hứng thú | ngán ngẩm (思い倦む)","to get tired of | to lose interest in","1578290"),
    ("項垂れる","うなだれる","v1|vi","cúi gằm đầu | gục đầu | rũ đầu | cúi đầu xuống","to hang one's head | to droop one's head","1676500"),
    ("頷ける","うなずける","v1|vi","gật gù đồng ý | thấy thuyết phục | chấp nhận được | thấy hợp lý","to be able to agree | to find acceptable","2851392"),
    ("打ちひしぐ","うちひしぐ","v5g|vt","đè bẹp | vùi dập | nghiền nát (bằng bất hạnh) | giáng đòn chí mạng","to crush (with misfortune)","2009530"),
    ("潤びる","ほとびる","v1|vi","nở ra (ngấm nước) | trương lên | mềm ra do thấm nước | bở ra","to be rehydrated | to swell from moisture","2436540"),
    ("餌食","えじき","n","mồi | con mồi | nạn nhân | miếng mồi ngon | vật hy sinh","prey | a victim","1173350"),
    ("得心","とくしん","n|vs|vi","thấu hiểu | tâm phục | đồng tình | chấp thuận | thông suốt","consenting to | being convinced of","1619840"),
    ("偉ぶる","えらぶる","v1|vi","ra vẻ ta đây | vênh váo | tỏ vẻ quan trọng | kiêu căng | làm bộ oai","to put on airs | to swagger","2122190"),
    ("媚びる","こびる","v1|vi","nịnh nọt | bợ đỡ | lấy lòng | làm duyên | õng ẹo quyến rũ","to flatter | to curry favor | to flirt","1566080"),
    ("咽ぶ","むせぶ","v5b|vi","nghẹn ngào | nghẹn lời | sặc | nghẹt thở (nức nở)","to be choked | to be stifled","2009850"),
    ("冤","えん","n","oan | tội oan | bị vu oan | nỗi oan (冤罪)","a false charge | a false accusation","1564260"),
    ("追従","ついじゅう","n|vs|vi","tuân theo | làm theo | a dua | xu nịnh | rập khuôn | phục tùng","following | being servile to | compliance","1432530"),
    ("怖じける","おじける","v1|vi","khiếp sợ | run sợ | hoảng hốt | rúm ró vì sợ | chùn bước","to be frightened | to be scared | to shrink in fear","2066470"),
    ("煽てる","おだてる","v1|vt","xu nịnh | tâng bốc | dụ dỗ | kích động | khích | dỗ ngọt","to flatter | to cajole | to instigate","1391600"),
    ("陥れる","おとしいれる","v1|vt","hãm hại | gài bẫy | đẩy vào thế bí | dồn vào (hỗn loạn) | đánh chiếm","to trap | to frame | to throw into (turmoil)","1216130"),
    ("怖気づく","おじけづく","v5k|vi","đâm sợ | mất tinh thần | chùn bước | nhụt chí | rén","to become frightened | to lose one's nerve | to chicken out","2007480"),
    ("気圧される","けおされる","v1|vi","bị áp đảo | bị lấn át | bị khớp | bị ngợp | bị uy hiếp tinh thần","to be overawed | to be overwhelmed | to be daunted","1873430"),
    ("慮外","りょがい","adj-na|adj-no|n","ngoài dự liệu | bất ngờ | khiếm nhã | thất lễ | hỗn xược","unexpected | unforeseen | rude","1553110"),
    ("温む","ぬるむ","v5m|vi","ấm lên | nguội bớt | trở nên âm ấm | hơi ấm (水温む春)","to become lukewarm | to become tepid","1183320"),
    ("慮り","おもんぱかり","n","sự cân nhắc | sự suy xét | mối lo xa | sự thận trọng","thought | consideration | fears","1852710"),
    ("慷慨","こうがい","n|vs|vt|vi","phẫn nộ chính nghĩa | than thở thời thế | bi phẫn ái quốc (悲憤慷慨)","righteous indignation | patriotic lamentation","1639790"),
    ("噛み締める","かみしめる","v1|vt","nhai kỹ | cắn chặt (môi) | suy ngẫm | nghiền ngẫm thấm thía","to chew thoroughly | to reflect upon","1209210"),
    ("噛み砕く","かみくだく","v5k|vt","nhai nát | nghiền nhỏ | giải thích đơn giản dễ hiểu | diễn giải nôm na","to crunch | to simplify | to explain plainly","1209170"),
    ("画する","かくする","vs-s|vt","vạch ra | phân định | kẻ ranh giới | hoạch định | đánh dấu (一線を画する)","to draw (a line) | to demarcate | to map out","1197060"),
    ("顧慮","こりょ","n|vs|vt","quan tâm | bận tâm | lưu ý | cân nhắc | để ý đến","concern | consideration","1267890"),
    ("燻製","くんせい","n|adj-no","đồ hun khói | thực phẩm xông khói | hun khói (cá, thịt)","smoked food | smoking (food)","1247350"),
    ("擡げる","もたげる","v1|vt","ngẩng lên | nhấc (đầu) lên | trỗi dậy | ngóc đầu dậy (頭をもたげる)","to raise (one's head)","1567780"),
    ("頑張り","がんばり","n","sự bền bỉ | sự cố gắng | nỗ lực | sự kiên trì gắng sức","tenacity | endurance | perseverance","1614350"),
    ("甲走る","かんばしる","v5r|vi","phát ra tiếng the thé | rít lên chói tai | âm sắc cao chói","to make a shrill sound","1850140"),
    ("気構え","きがまえ","n","tinh thần sẵn sàng | sự chuẩn bị tâm thế | thái độ | quyết tâm","readiness | preparedness | attitude","1222200"),
    ("聞き及ぶ","ききおよぶ","v5b|vt","nghe nói | nghe đồn | được biết qua tai nghe | nghe phong thanh","to hear of | to learn of","1505750"),
    ("帰す","きす","v5s|vs-c","rốt cuộc thành | dẫn đến | quy về | quy kết | đổ cho","to come to (in the end) | to attribute","2410530"),
    ("来す","きたす","v5s|vt","gây ra | dẫn đến | đem lại | sinh ra (kết quả/tình trạng) (支障を来す)","to cause | to bring about | to induce","1591260"),
    ("忌む","いむ","v5m|vi","kiêng kỵ | tránh | xa lánh | ghê tởm | gớm ghét","to avoid | to shun | to detest","1220090"),
    ("朽ち果てる","くちはてる","v1|vi","mục nát hoàn toàn | mục rữa | tàn lụi | chết trong vô danh | đổ nát","to rot away | to decay completely | to die in obscurity","1229320"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
