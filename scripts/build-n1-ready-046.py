# -*- coding: utf-8 -*-
"""Build N1 ready wave 046 — formal/colloquial nouns + 慣用句 (set 46)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-046.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("不縁","ふえん","n","ly hôn | duyên không thành | lương duyên dang dở | vô duyên (hôn nhân)","divorce | unrealized marriage prospects","1491310"),
    ("風物詩","ふうぶつし","n","nét đặc trưng mùa | cảnh sắc tiêu biểu của mùa | thơ tả cảnh mùa","a feature of the season | something characteristic of a season","1844120"),
    ("俯角","ふかく","n","góc nhìn xuống | góc hạ | góc nghiêng xuống","angle of depression | angle of dip","1563580"),
    ("不可侵","ふかしん","n|adj-no","bất khả xâm phạm | không thể xâm phạm | thiêng liêng | hiệp ước bất tương xâm","inviolability | nonaggression","1491460"),
    ("不可分","ふかぶん","adj-no|adj-na|n","không thể chia tách | bất khả phân | gắn liền không tách rời","indivisible | inseparable","1491550"),
    ("含み","ふくみ","n","hàm ý | ý ẩn | sắc thái ngầm | sự bao hàm | ẩn ý","implication | hidden meaning | nuance","1216850"),
    ("河豚","ふぐ","n","cá nóc | cá phình | cá fugu","puffer fish | fugu | blowfish","1193570"),
    ("不行跡","ふぎょうせき","n|adj-na|adj-no","hành vi sai trái | cư xử bê bối | hạnh kiểm xấu | trác táng","misconduct | misbehaviour | impropriety","1492390"),
    ("不見識","ふけんしき","adj-na|n","thiếu suy xét | nông cạn | thiếu chính kiến | hành xử kém cỏi | đáng hổ thẹn","thoughtless | lacking common sense | undignified","1492220"),
    ("富貴","ふうき","adj-na|n","phú quý | giàu sang | giàu có và quyền cao","riches and honours | wealth and rank","1496760"),
    ("不興を買う","ふきょうをかう","exp|v5u","làm phật lòng | khiến ai phật ý | chuốc lấy sự bất bình | mất lòng","to incur someone's displeasure | to fall into disgrace","2119040"),
    ("俯瞰図","ふかんず","n","sơ đồ nhìn từ trên cao | bản đồ toàn cảnh | hình chiếu từ trên xuống","a bird's-eye view | an overhead view","1563680"),
    ("覆面","ふくめん","n|vs|vi|adj-no","mặt nạ | che mặt | ngụy trang | ẩn danh | bịt mặt (覆面パトカー: xe cảnh sát ngầm)","a mask | a disguise | anonymous | unmarked","1501520"),
    ("含み笑い","ふくみわらい","n|vs","cười thầm | cười khúc khích | nén cười | mỉm cười ý nhị","a suppressed laugh | a chuckle","1216860"),
    ("更ける","ふける","v1|vi","đêm về khuya | trời về khuya | (đêm) dần tàn | khuya dần","to grow late (of the night) | to wear on","1279290"),
    ("節","ふし","n","đốt | khớp | giai điệu | mấu chốt | mắt gỗ | điểm đáng chú ý","a joint | a tune | a knot (in wood) | a notable point","1386160"),
    ("扶持","ふち","n|vs|vt","bổng lộc | lương bổng (gạo cho samurai) | trợ cấp | cấp dưỡng","a stipend | a salary (in rice)","1496970"),
    ("仏滅","ぶつめつ","n","Phật nhập diệt | ngày đại hung (lịch cổ) | ngày xui xẻo nhất","Buddha's death | a very unlucky day","1502340"),
    ("不行き届き","ふゆきとどき","adj-na|n","sơ suất | thiếu chu đáo | bất cẩn | quản lý kém | lơ là","negligence | carelessness | mismanagement","1602890"),
    ("不夜城","ふやじょう","n","thành phố không ngủ | nơi đèn sáng thâu đêm | chốn ăn chơi thâu đêm","a city that never sleeps | a nightless city","1495150"),
    ("不用意","ふようい","adj-na|n","thiếu chuẩn bị | bất cẩn | hớ hênh | sơ ý | thiếu thận trọng","unprepared | careless | imprudent | inadvertent","1495180"),
    ("無頼","ぶらい","adj-no|adj-na|n","vô lại | côn đồ | du đãng | bất cần | ngông nghênh tự tại","villainous | rascally | independent | self-reliant","1673670"),
    ("分別盛り","ふんべつざかり","adj-no|adj-na|n","tuổi chín chắn | độ tuổi đủ khôn ngoan | tuổi đủ phán đoán đúng đắn","at the age of sound judgement","1504220"),
    ("噴霧","ふんむ","n|vs|vt","phun sương | xịt | phun mù | tạo bụi nước","atomizing | spraying","2656950"),
    ("返り討ち","かえりうち","n","kẻ báo thù bị giết | bị phản đòn | bị gậy ông đập lưng ông | thua ngược","having the tables turned on oneself | killing a would-be avenger","1680570"),
    ("変わり身","かわりみ","n","sự thay đổi lập trường | tài né tránh | sự trở mặt nhanh | linh hoạt né đòn","a change of attitude | nimbleness in dodging","1843160"),
    ("彷徨","ほうこう","n|vs|vi","lang thang | lảng vảng | đi vơ vẩn | rong ruổi vô định","wandering | rambling | roaming","1566720"),
    ("忘恩","ぼうおん","n","vong ân | bội bạc | quên ơn | bạc nghĩa (忘恩の徒)","ingratitude | thanklessness","1519240"),
    ("報恩","ほうおん","n|vs","báo ân | đền ơn | trả nghĩa | tri ân","repaying a kindness | gratitude","1627420"),
    ("忘却","ぼうきゃく","n|vs|vt","lãng quên | quên bẵng | rơi vào quên lãng | quên sạch","forgetting completely | oblivion","1519260"),
    ("方今","ほうこん","n|adv","hiện nay | ngày nay | thời buổi này | đương thời","the present time | nowadays","1654990"),
    ("法螺","ほら","n","khoác lác | nói phét | tù và ốc biển | thổi phồng (法螺を吹く)","boasting | big talk | a conch trumpet","1805460"),
    ("鳳凰","ほうおう","n","phượng hoàng | chim phượng | linh điểu phương Đông","the Chinese phoenix | the firebird","1518400"),
    ("菩薩","ぼさつ","n|n-suf","bồ tát | bậc giác ngộ cứu độ chúng sinh | Bồ Tát","a bodhisattva","1515240"),
    ("木石","ぼくせき","n","cây và đá | người vô tình | kẻ gỗ đá | người lạnh lùng vô cảm","trees and stones | an unfeeling person","1534710"),
    ("誇らしい","ほこらしい","adj-i","tự hào | hãnh diện | đầy tự hào | vênh vang","proud | feeling proud","1267730"),
    ("発句","ほっく","n","câu mở đầu renga | câu thơ haiku | năm âm đầu của tanka","the opening verse of a renga | a haiku","1651850"),
    ("迸る","ほとばしる","v5r|vi","tuôn trào | phun ra | vọt ra | dâng trào (nhiệt huyết)","to gush out | to surge | to well up","1573660"),
    ("保身","ほしん","n","giữ mình | tự bảo vệ bản thân | thủ thân | giữ thân (保身術)","self-protection | self-preservation","1513850"),
    ("歩調","ほちょう","n","nhịp bước | bước chân | nhịp độ | sự đồng điệu (歩調を合わせる)","pace | step | cadence","1514410"),
    ("菩提樹","ぼだいじゅ","n","cây bồ đề | cây đề | cây giác ngộ","the bodhi tree | the bo tree","1515250"),
    ("反骨","はんこつ","n","tinh thần phản kháng | khí phách bất khuất | thái độ ngang ngạnh (反骨精神)","a rebellious spirit | a defiant attitude","1680360"),
    ("程々","ほどほど","adj-no|n","vừa phải | chừng mực | điều độ | có giới hạn (程々にする)","moderate | in moderation","1011680"),
    ("仄か","ほのか","adj-na","thoang thoảng | mờ nhạt | mơ hồ | phảng phất | thấp thoáng","faint | dim | vague | subtle","1603520"),
    ("程合い","ほどあい","n","mức độ vừa phải | sự chừng mực | độ phù hợp | liều lượng vừa","moderation | the right degree","1735830"),
    ("彫り物","ほりもの","n","đồ chạm khắc | tác phẩm điêu khắc | hình xăm | chạm trổ","carving | engraving | a tattoo","1603590"),
    ("本望","ほんもう","n","tâm nguyện | ước nguyện bấy lâu | toại nguyện | mãn nguyện","a long-cherished desire | satisfaction","1523220"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
