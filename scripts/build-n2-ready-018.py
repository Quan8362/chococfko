# -*- coding: utf-8 -*-
"""Build N2 ready wave 018 — academia, research, logic, statistics, study."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-018.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("学術","がくじゅつ","n","học thuật | khoa học | nghiên cứu hàn lâm","science | scholarship | academic pursuits","1206870"),
    ("学識","がくしき","n","học vấn | kiến thức uyên bác | học thức","scholarship | scientific attainments","1206780"),
    ("教職","きょうしょく","n","nghề giáo | nghề dạy học","the teaching profession","1237220"),
    ("教員","きょういん","n","giáo viên | giảng viên | đội ngũ giảng dạy","teacher | instructor | teaching staff","1236980"),
    ("助教","じょきょう","n","trợ giảng | phó giáo sư trợ lý","assistant professor","1344540"),
    ("博士","はかせ","n|n-suf","tiến sĩ | chuyên gia | người uyên bác","expert | doctor | PhD","1474620"),
    ("修士","しゅうし","n","thạc sĩ | bằng thạc sĩ","master's (degree)","1332020"),
    ("学士","がくし","n","cử nhân | bằng cử nhân | người tốt nghiệp đại học","university graduate | bachelor's degree","1206760"),
    ("博士号","はくしごう","n","học vị tiến sĩ | bằng tiến sĩ","doctor's degree | doctorate | PhD","1474650"),
    ("卒論","そつろん","n","luận văn tốt nghiệp | khóa luận","graduation thesis | bachelor's thesis","1405990"),
    ("研究室","けんきゅうしつ","n","phòng nghiên cứu | phòng thí nghiệm | văn phòng giáo sư","laboratory | seminar room | professor's office","1258570"),
    ("学会","がっかい","n","hội học thuật | hội nghị khoa học | viện hàn lâm","learned society | academic conference","1206610"),
    ("学界","がっかい","n","giới học thuật | giới hàn lâm","academic world | academia | academic circles","1206620"),
    ("学派","がくは","n","trường phái (tư tưởng) | học phái","school (of thought) | sect","1207040"),
    ("学説","がくせつ","n","học thuyết | lý thuyết","theory","1206950"),
    ("定理","ていり","n","định lý | mệnh đề","theorem | proposition","1435780"),
    ("実証","じっしょう","n|vs|adj-no|vt|vi","minh chứng | thực chứng | chứng minh thực tế","demonstration | verification | actual proof","1321210"),
    ("論証","ろんしょう","n|vs|vt","luận chứng | chứng minh | lập luận","proof | demonstration | argumentation","1561730"),
    ("反証","はんしょう","n|vs|vt","phản chứng | bằng chứng ngược lại | bác bỏ","disproof | counter-evidence | rebuttal","1480550"),
    ("帰納","きのう","n|vs|vt","quy nạp | suy luận quy nạp","induction | inductive reasoning","1221470"),
    ("演繹","えんえき","n|vs|vt","diễn dịch | suy luận diễn dịch","deductive reasoning | deduction","1177050"),
    ("解析","かいせき","n|vs|vt","phân tích | giải tích | phân tích cú pháp","analysis | analytical study | parsing","1199060"),
    ("標本","ひょうほん","n","mẫu vật | tiêu bản | mẫu (thống kê)","specimen | sample | example","1488820"),
    ("標準","ひょうじゅん","n","tiêu chuẩn | chuẩn mực | mức trung bình","standard | criterion | norm","1488710"),
    ("偏差","へんさ","n","độ lệch | sai lệch | độ chênh","deflection | deviation | variation","1510450"),
    ("誤差","ごさ","n","sai số (đo lường, tính toán)","measurement error | calculation error","1271320"),
    ("近似","きんじ","n|vs|vi|adj-no","xấp xỉ | gần đúng | tương tự | gần giống","approximation | having a close resemblance","1242330"),
    ("変数","へんすう","n","biến số","variable","1511200"),
    ("定数","ていすう","n","hằng số | định số | số cố định | định mức","fixed number | constant | quorum","1435660"),
    ("係数","けいすう","n","hệ số","coefficient | factor | modulus","1249310"),
    ("指数","しすう","n","chỉ số | số mũ | hệ số","index | indicator | exponent","1309860"),
    ("相関","そうかん","n|vs|vi","tương quan | mối liên hệ qua lại","correlation | interrelation","1400860"),
    ("因果","いんが","n|adj-na","nhân quả | quan hệ nhân quả | nghiệp | xui xẻo","cause and effect | causality | karma","1168680"),
    ("階層","かいそう","n","tầng lớp | cấp bậc | thứ bậc | tầng (cấu trúc)","class | level | stratum | hierarchy","1203080"),
    ("範疇","はんちゅう","n","phạm trù | hạng mục","category","1481910"),
    ("定義","ていぎ","n|vs|vt","định nghĩa","definition","1435530"),
    ("文献","ぶんけん","n","tài liệu tham khảo | văn liệu | thư tịch","literature | reference books | document","1505330"),
    ("参照","さんしょう","n|vs|vt","tham chiếu | đối chiếu | tra cứu","reference | consultation | comparison","1302410"),
    ("履修","りしゅう","n|vs|vt","học (môn) | hoàn thành (khóa học) | đăng ký học","taking (a class) | completion (of a course)","1549800"),
    ("受講","じゅこう","n|vs|vt|vi","dự giảng | tham dự khóa học | nghe giảng","taking a lecture | taking a course","1329760"),
    ("聴講","ちょうこう","n|vs|vt|vi","dự thính | nghe giảng | tham dự bài giảng","lecture attendance | auditing","1428890"),
    ("出席","しゅっせき","n|vs|vi","có mặt | tham dự | dự (lớp, họp)","attendance | presence","1339460"),
    ("留年","りゅうねん","n|vs|vi","lưu ban | ở lại lớp | học lại năm","repeating a year (at school)","1612260"),
    ("休学","きゅうがく","n|vs|vt","bảo lưu | tạm nghỉ học","temporary absence from school","1227660"),
    ("復学","ふくがく","n|vs|vi","đi học lại | quay lại trường","return to school","1827630"),
    ("願書","がんしょ","n","đơn xin | đơn đăng ký | hồ sơ dự tuyển","(written) application | petition","1218050"),
    ("出願","しゅつがん","n|vs|vt|vi","nộp đơn | làm đơn xin | đăng ký","application | filing an application","1338500"),
    ("学費","がくひ","n","học phí | chi phí học hành","tuition | school expenses","1207060"),
    ("事典","じてん","n","bách khoa toàn thư | từ điển bách khoa","encyclopedia","1314210"),
    ("図鑑","ずかん","n","sách tranh minh họa | sách tra cứu có hình | atlas","pictorial book | illustrated reference book | field guide","1370370"),
    ("年鑑","ねんかん","n","niên giám | sách thường niên","yearbook | almanac | annual","1468370"),
    ("手引き","てびき","n|vs|vt","hướng dẫn | dẫn dắt | cẩm nang | mối quan hệ","guidance | introduction | guidebook | manual","1598410"),
    ("入門","にゅうもん","n|vs|vi","nhập môn | vào học | sách nhập môn | hướng dẫn cơ bản","becoming a pupil | introduction | primer","1466790"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
