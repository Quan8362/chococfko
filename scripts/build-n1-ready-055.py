# -*- coding: utf-8 -*-
"""Build N1 ready wave 055 — literary 漢語 (set 55)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-055.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("深淵","しんえん","n","vực thẳm | hố sâu | vực sâu thăm thẳm | thâm uyên","an abyss | a ravine","1362790"),
    ("心服","しんぷく","n|vs|vi","tâm phục | khâm phục từ đáy lòng | quy phục chân thành | phục sát đất","admiration and devotion | hearty submission","1360970"),
    ("人倫","じんりん","n","luân thường | đạo làm người | nhân luân | quan hệ con người","human relations | humanity","1369520"),
    ("深慮遠謀","しんりょえんぼう","n","thâm mưu viễn lự | mưu sâu kế xa | tính toán lâu dài thấu đáo","deep design and forethought","2031410"),
    ("進境","しんきょう","n","sự tiến bộ | bước tiến | sự thăng tiến | tiến cảnh (進境著しい)","progress | improvement","1366040"),
    ("親近","しんきん","n|vs|vi","thân cận | gần gũi | thân thiết | người tâm phúc | gắn bó (親近感)","becoming closer | familiarity | a close aide","1720800"),
    ("深紅","しんく","n","đỏ thẫm | đỏ thắm | đỏ sậm | son đậm","deep crimson","1580580"),
    ("心魂","しんこん","n","tâm hồn | cả trái tim | thân tâm | hết lòng (心魂を傾ける)","heart and soul","1646900"),
    ("深甚","しんじん","adj-na|adj-no","sâu sắc | chân thành sâu đậm | thâm tạ | thành kính (深甚なる謝意)","profound | deep | heartfelt","1616180"),
    ("信託","しんたく","n|vs|vt","ủy thác | tín thác | giao phó tin cậy | quỹ tín thác","trust | entrusting","1359410"),
    ("心頭","しんとう","n","tâm trí | trong lòng | trong tâm (心頭滅却: diệt trừ tạp niệm)","the heart | the mind","1793840"),
    ("神農","しんのう","n","Thần Nông | vị vua huyền thoại Trung Hoa (tổ nghề nông và y dược)","Shennong (mythical Chinese king)","2785540"),
    ("親身","しんみ","n|adj-na|adj-no","thân tình | ân cần như người nhà | tận tâm | chu đáo nồng hậu","kind | cordial | like a close relative","1365220"),
    ("睡魔","すいま","n","cơn buồn ngủ | thần ngủ | ma ngủ | cơn ngủ gật (睡魔に襲われる)","drowsiness | the sandman","1654370"),
    ("趨向","すうこう","n|vs","xu hướng | chiều hướng | xu thế | trào lưu","a tendency | a trend","1708150"),
    ("凄まじい","すさまじい","adj-i","khủng khiếp | dữ dội | ghê gớm | mãnh liệt | kinh khủng","terrible | dreadful | tremendous | staggering","1595640"),
    ("頭脳明晰","ずのうめいせき","n|adj-na","đầu óc minh mẫn | trí tuệ sáng suốt | tư duy sắc bén | thông tuệ","clearheadedness | sharpness of mind","2047830"),
    ("図抜ける","ずぬける","v1|vi","vượt trội hẳn | nổi bật hơn người | trội hẳn lên | xuất chúng","to tower above | to stand out","1692300"),
    ("墨絵","すみえ","n|adj-no","tranh thủy mặc | tranh mực tàu | thủy mặc họa","an ink painting","1521530"),
    ("寸言","すんげん","n","lời ngắn gọn sắc sảo | câu nói súc tích | lời châm biếm tinh tế","a pithy, witty remark | a wisecrack","1700310"),
    ("寸断","すんだん","n|vs|vt","cắt vụn | xé tan tành | chia cắt từng mảnh | đứt đoạn (道路が寸断)","cutting to pieces | severing","1373770"),
    ("正鵠","せいこく","n","hồng tâm | điểm trúng đích | đúng trọng tâm (正鵠を射る: nói trúng)","the bull's-eye | the mark | the point","1377140"),
    ("青史","せいし","n","thanh sử | sử sách | trang sử | sử xanh (青史に名を残す)","(written) history","1750030"),
    ("盛者","しょうじゃ","n","kẻ thịnh vượng | người quyền thế | bậc đang thịnh (盛者必衰)","a prosperous, powerful person","1663570"),
    ("精粋","せいすい","n","tinh túy | trong sạch không vụ lợi | thuần khiết","purity | unselfishness","1380050"),
    ("清濁","せいだく","n","trong đục | tốt xấu | thiện ác | âm hữu thanh và vô thanh (清濁併せ呑む)","good and evil | purity and impurity","1378350"),
    ("聖断","せいだん","n","thánh đoán | quyết định của hoàng đế | thánh chỉ phán quyết","an imperial decision","1380370"),
    ("征伐","せいばつ","n|vs","chinh phạt | trừng phạt | thảo phạt | đánh dẹp | chinh phục","conquest | subjugation | a punitive expedition","1375220"),
    ("精霊","せいれい","n","linh hồn | vong linh | tinh linh | ma | hồn ma","a spirit | a soul | a ghost","1380230"),
    ("赤貧","せきひん","n|adj-no","bần cùng | nghèo rớt mồng tơi | cùng đinh | nghèo xơ xác (赤貧洗うが如し)","extreme poverty","1383590"),
    ("石碑","せきひ","n","bia đá | tấm bia | thạch bi | bia mộ","a stone monument | a stele","1382780"),
    ("寂寥","せきりょう","n|adj-t|adv-to","cô liêu | quạnh hiu | hoang vắng | tịch mịch | đìu hiu","loneliness | desolateness","1324500"),
    ("脊梁","せきりょう","n","sống lưng | dãy núi xương sống | cột sống | xương sống","the spinal column | a mountain backbone","1777770"),
    ("世故","せいこ","n","việc đời | thế sự | sự đời | nhân tình thế thái (世故に長ける)","worldly affairs","1580830"),
    ("世襲","せしゅう","n|vs|vt|adj-no","cha truyền con nối | thế tập | kế thừa dòng họ | truyền đời","heredity | hereditary succession","1374080"),
    ("拙者","せっしゃ","pn","tại hạ | kẻ hèn này | tôi (khiêm, lối nói samurai)","I | me (humble, samurai speech)","1385290"),
    ("拙速","せっそく","adj-na|n","vội vàng cẩu thả | làm nhanh mà ẩu | hấp tấp sơ sài | qua loa","hasty | slapdash | rough-and-ready","1385300"),
    ("切望","せつぼう","n|vs|vt|adj-no","khao khát | tha thiết mong mỏi | ao ước | mong ngóng | thèm muốn","an earnest desire | longing | yearning","1385220"),
    ("是非曲直","ぜひきょくちょく","n","phải trái đúng sai | thị phi khúc trực | lẽ phải và điều sai","the rights and wrongs (of a case)","2031530"),
    ("施薬","せやく","n|vs|vt|vi","phát thuốc miễn phí | cấp thuốc từ thiện | bố thí thuốc men","dispensation of free medicine","1646320"),
    ("潜心","せんしん","n","tĩnh tâm | trầm tư mặc tưởng | dồn hết tâm trí | tập trung suy ngẫm","meditation | concentration","1568830"),
    ("専制君主","せんせいくんしゅ","n","quân chủ chuyên chế | bạo chúa | vua độc tài | nhà cai trị độc đoán","an absolute monarch | a despot","1703770"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
