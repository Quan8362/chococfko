# -*- coding: utf-8 -*-
"""Build N1 ready wave 078 — remaining 四字熟語 (set 78)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-078.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("悪口雑言","あっこうぞうごん","n","chửi bới thậm tệ | mắng nhiếc đủ điều | lăng mạ thậm tệ | nói xấu đủ kiểu","heaping verbal abuse | cursing and swearing","1151740"),
    ("右顧左眄","うこさべん","n|vs|vi","nhìn trước ngó sau | do dự vì sợ dư luận | chần chừ lưỡng lự | thấp thỏm e ngại","wavering | hesitation (out of concern for others' views)","1619960"),
    ("円満具足","えんまんぐそく","n|vs","viên mãn đầy đủ | trọn vẹn an hòa | đầy đủ hài hòa | mọi sự vẹn toàn","being complete, tranquil and in harmony","2030120"),
    ("気炎万丈","きえんばんじょう","n","hùng hồn khí thế | hăng hái nói lớn | khí thế ngút trời | ba hoa hùng hồn","being in high spirits | talking big","1221940"),
    ("疑心暗鬼","ぎしんあんき","exp","đa nghi sinh sợ | nghi ngờ thì cái gì cũng đáng ngờ | tự dọa bóng dọa gió","once suspicious, everything looks suspicious","1225600"),
    ("牛飲馬食","ぎゅういんばしょく","n|vs|vi","ăn uống vô độ | ăn như rồng cuốn uống như voi | chén tì tì | phàm ăn tục uống","gorging and swilling | heavy eating and drinking","1616940"),
    ("緊褌一番","きんこんいちばん","n","thắt lưng buộc bụng quyết tâm | dốc sức chuẩn bị | nai nịt gọn gàng xông pha","girding oneself up (for a challenge)","1241950"),
    ("空理空論","くうりくうろん","n","lý thuyết suông | lý luận viển vông | bàn giấy phi thực tế | luận điệu rỗng tuếch","impractical theory | empty argument","1675980"),
    ("君子豹変","くんしひょうへん","n","quân tử biến như báo | người khôn mau sửa lỗi | bậc trí giả mau thích nghi (đôi khi mỉa: trở mặt nhanh)","the wise readily adapt to changed circumstances","1247280"),
    ("軽佻浮薄","けいちょうふはく","n|adj-na","nông nổi hời hợt | bộp chộp phù phiếm | nhẹ dạ thiếu sâu sắc | hời hợt nông cạn","frivolity | shallowness | superficiality","1252940"),
    ("甲論乙駁","こうろんおつばく","n|vs|vi","kẻ tán thành người phản đối | tranh luận ý kiến trái chiều | bàn cãi xôn xao | mỗi người một ý","arguments pro and con","1280320"),
    ("才子多病","さいしたびょう","exp","tài hoa bạc mệnh | người tài thường yếu | hồng nhan đa truân (với người tài) | thiên tài đoản mệnh","talented people tend to be of delicate health","2045520"),
    ("三面六臂","さんめんろっぴ","n","ba đầu sáu tay | làm việc của nhiều người | đa năng tháo vát | bận tối mắt tối mũi","versatility | doing the work of many","1301760"),
    ("新陳代謝","しんちんたいしゃ","n|vs|vi","trao đổi chất | sự thay cũ đổi mới | đào thải cũ thay mới | tái tạo đổi mới","metabolism | renewal | replacement of the old with the new","1362210"),
    ("千慮一失","せんりょいっしつ","n","khôn ngoan cũng có lúc sai | người cẩn thận vẫn có sơ suất | nghìn lo vẫn sót một","a slip by an otherwise careful person","2040560"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
