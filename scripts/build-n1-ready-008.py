# -*- coding: utf-8 -*-
"""Build N1 ready wave 008 — 四字熟語 idioms + formal adjectives (set 8)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-008.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("青天白日","せいてんはくじつ","n","trời quang mây tạnh | trong sạch | minh oan | thanh thản lương tâm","clear weather | being cleared of a charge | clear conscience","1381680"),
    ("責任転嫁","せきにんてんか","n|vs","đổ trách nhiệm | đùn đẩy lỗi | trút trách nhiệm cho người khác","shifting the responsibility | passing the buck","1383200"),
    ("絶体絶命","ぜったいぜつめい","n|adj-no|adj-na","tuyệt lộ | đường cùng | bị dồn vào chân tường","desperate situation with no escape | being cornered","1386830"),
    ("大義名分","たいぎめいぶん","n","đại nghĩa | chính nghĩa | danh nghĩa chính đáng | lý do chính đáng","just cause | good reason | justification","1413380"),
    ("適材適所","てきざいてきしょ","exp|n","đúng người đúng việc | dụng nhân đắc dụng","the right person in the right place","1437400"),
    ("内憂外患","ないゆうがいかん","n","nội ưu ngoại hoạn | giặc trong thù ngoài | khó khăn trong lẫn ngoài","troubles both at home and abroad","1459380"),
    ("南船北馬","なんせんほくば","n","bôn ba khắp nơi | rong ruổi đó đây | đi lại liên miên","constant travelling | being on the move","1460400"),
    ("二律背反","にりつはいはん","n","mâu thuẫn nội tại | nghịch lý | tiến thoái lưỡng nan","antinomy | self-contradiction | either-or situation","1463270"),
    ("馬耳東風","ばじとうふう","n","nước đổ đầu vịt | đàn gảy tai trâu | thờ ơ phớt lờ","utter indifference | talking to the wall","1471620"),
    ("八方美人","はっぽうびじん","n","người ba phải | kẻ chiều lòng tất cả | đẹp lòng mọi người","everybody's friend | people pleaser","1477050"),
    ("飛躍","ひやく","n|vs|vi","nhảy vọt | bứt phá | tiến bộ vượt bậc | nhảy cóc (logic)","leap | rapid progress | great strides | leap of logic","1485560"),
    ("津々浦々","つつうらうら","adv|n","khắp mọi miền đất nước | mọi ngóc ngách | khắp nơi","all over the country | far and wide","1597990"),
    ("取捨選択","しゅしゃせんたく","n|vs|adj-no","chọn lọc | sàng lọc | cân nhắc lấy bỏ","selection | making a choice | sifting","1327050"),
    ("笑止千万","しょうしせんばん","adj-na|n","nực cười | lố bịch hết sức | hết sức phi lý","highly ridiculous | quite absurd","1351420"),
    ("海千山千","うみせんやません","adj-no|n","lọc lõi | lão luyện | cáo già | từng trải gian xảo","cunning and worldly-wise | crafty | sly old fox","1201560"),
    ("雲散霧消","うんさんむしょう","n|vs|vi","tan biến như sương khói | tiêu tan | biến mất không dấu vết","vanishing like mist","1173190"),
    ("栄耀栄華","えいようえいが","n","vinh hoa phú quý | xa hoa hưởng lạc | giàu sang tột bậc","wealth and prosperity | luxury | living sumptuously","1794740"),
    ("岡目八目","おかめはちもく","n","người ngoài cuộc nhìn rõ hơn | bàng quan giả tỉnh táo","bystander's better grasp of the situation","1588980"),
    ("画竜点睛","がりょうてんせい","n","điểm nhãn | nét chấm phá cuối cùng quyết định | hoàn thiện cốt lõi","finishing touches | last vital touch","1591020"),
    ("勤倹貯蓄","きんけんちょちく","n","cần kiệm tích lũy | chăm chỉ tiết kiệm","thrift and saving","2044200"),
    ("謹厳実直","きんげんじっちょく","n","nghiêm túc thật thà | đứng đắn ngay thẳng","sober and honest","1779870"),
    ("鶏口牛後","けいこうぎゅうご","exp","thà làm đầu gà còn hơn làm đuôi trâu | làm đầu nơi nhỏ hơn theo đuôi nơi lớn","better to be the head of a small group than the tail of a large one","2030700"),
    ("権謀術数","けんぼうじゅっすう","n","mưu mô xảo quyệt | thủ đoạn quyền biến | mánh khóe","trickery | wiles | Machiavellism","1258190"),
    ("乾坤一擲","けんこんいってき","n","được ăn cả ngã về không | đặt cược tất tay | một phen sống mái","staking all on one throw | all or nothing","1209790"),
    ("故事来歴","こじらいれき","n","nguồn gốc lịch sử | điển tích lai lịch | ngọn ngành","origin and history | particulars","1593240"),
    ("極悪非道","ごくあくひどう","n|adj-na|adj-no","cực kỳ tàn ác | vô nhân đạo | hung tàn bạo ngược","inhuman | heinous | atrocious","2030580"),
    ("五穀豊穣","ごこくほうじょう","n","ngũ cốc bội thu | mùa màng tươi tốt | được mùa","bumper crop | abundant harvest","2045150"),
    ("山紫水明","さんしすいめい","n","non xanh nước biếc | phong cảnh hữu tình","scenic beauty","1302890"),
    ("三寒四温","さんかんしおん","n","ba ngày lạnh bốn ngày ấm (tiết cuối đông đầu xuân)","alternation of three cold and four warm days","1300130"),
    ("釈迦に説法","しゃかにせっぽう","exp","múa rìu qua mắt thợ | dạy đời người giỏi hơn mình | múa búa trước cửa Lỗ Ban","teaching your grandmother to suck eggs | preaching to the choir","2093310"),
    ("取捨","しゅしゃ","n|vs|vt","lấy bỏ | chọn lọc | sự lựa chọn","adoption or rejection | selection | choice","1327040"),
    ("小春日和","こはるびより","n","tiết thu ấm áp | ngày đông ấm như xuân (khoảng tháng 11)","Indian summer | mild late autumn weather","1348280"),
    ("冗談半分","じょうだんはんぶん","n","nửa đùa nửa thật | nói nửa đùa | bông đùa","half joking | being only half serious","2047020"),
    ("枝葉","えだは","n|adj-no","cành lá | tiểu tiết | chi tiết vụn vặt | phụ nhánh","branches and leaves | unimportant details | side issue","1579520"),
    ("神出鬼没","しんしゅつきぼつ","n|adj-no","thoắt ẩn thoắt hiện | xuất quỷ nhập thần | khó lường","appearing unexpectedly | elusive | phantom","1364700"),
    ("深謀遠慮","しんぼうえんりょ","n","mưu sâu kế xa | tính toán lâu dài | thâm mưu viễn lự","far sight and deep design","1362800"),
    ("潔癖","けっぺき","adj-na|n","sạch sẽ thái quá | ưa sạch | khó tính về vệ sinh | liêm khiết","fastidiousness | love of cleanliness","1254470"),
    ("高潔","こうけつ","adj-na|n","cao thượng | thanh cao | thanh liêm | trong sạch","noble | lofty | high-minded | upright","1283440"),
    ("篤実","とくじつ","n|adj-na","trung hậu | thành thật | chân thành | đôn hậu","sincerity | faithfulness","1655610"),
    ("質朴","しつぼく","adj-na|n","mộc mạc | chất phác | giản dị | chân chất","simple and honest | unsophisticated","1320750"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
