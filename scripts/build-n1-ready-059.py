# -*- coding: utf-8 -*-
"""Build N1 ready wave 059 — literary 漢語 (set 59)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-059.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("風流","ふうりゅう","n|adj-na","phong lưu | tao nhã | thanh nhã | gu thẩm mỹ tinh tế | thú phong nhã","elegance | taste | refinement","1500070"),
    ("俯仰","ふぎょう","n|vs|vi","cúi ngẩng | nhìn lên nhìn xuống | cử chỉ hành vi (俯仰天地に愧じず)","looking up and down | one's actions","1563590"),
    ("覆水","ふくすい","n","nước đã đổ | bát nước hắt đi (覆水盆に返らず: ván đã đóng thuyền)","spilt water","2853360"),
    ("複眼","ふくがん","n","mắt kép | mắt phức hợp (côn trùng) | góc nhìn đa chiều","a compound eye","1501310"),
    ("腹蔵","ふくぞう","n","giấu kín suy nghĩ | giữ ý | che giấu lòng dạ (腹蔵なく: thẳng thắn)","concealing one's thoughts | reserve","1748340"),
    ("輻輳","ふくそう","n|vs|vi","tắc nghẽn | dồn ứ | chen chúc | hội tụ (đường truyền/mắt)","congestion | overcrowding | convergence","1573490"),
    ("伏兵","ふくへい","n","phục binh | quân mai phục | trở ngại bất ngờ | đối thủ không lường","an ambush | unexpected opposition","1500310"),
    ("不軌","ふき","n","phi pháp | làm loạn | vi phạm phép tắc | mưu phản (不軌を図る)","lawlessness | sedition","1491880"),
    ("不屈","ふくつ","n|adj-no|adj-na","bất khuất | kiên cường | không nao núng | bền chí (不撓不屈)","persistence | fortitude | indomitability","1492080"),
    ("扶持米","ふちまい","n","lương bằng gạo | bổng lộc gạo (cấp cho samurai)","a stipend paid in rice","1690950"),
    ("仏典","ぶってん","n","kinh Phật | kinh điển Phật giáo | kinh sách nhà Phật","Buddhist scriptures | sutras","1502230"),
    ("不抜","ふばつ","adj-na|n","kiên định | vững vàng | bất khuất | không lay chuyển (堅忍不抜)","firm | steadfast | indomitable","1494600"),
    ("不偏不党","ふへんふとう","n|adj-no","không thiên vị | trung lập | vô tư | không theo phe phái nào","impartiality | neutrality","1494830"),
    ("浮浪","ふろう","n|vs|vi","lang thang | vô gia cư | du thủ du thực | lêu lổng (浮浪者)","vagrancy | wandering around","1497590"),
    ("不惑","ふわく","n","tuổi tứ tuần | tuổi bốn mươi | tuổi không còn mê lầm (不惑の年)","the age of forty | being free from doubts","1495470"),
    ("分轄","ぶんかつ","n|vs|vt","phân quyền quản lý | chia quyền cai quản | quản hạt riêng","separate jurisdiction","1503310"),
    ("分秒","ふんびょう","n","từng phút từng giây | khoảnh khắc | tích tắc (分秒を争う)","a moment | minutes and seconds","1504150"),
    ("焚刑","ふんけい","n","hỏa hình | thiêu sống | xử tử bằng lửa","burning at the stake","1690040"),
    ("文弱","ぶんじゃく","adj-na|n","mọt sách yếu đuối | ham học mà nhu nhược | trói gà không chặt","being weak from too much study","1723370"),
    ("紛々","ふんぷん","adj-t|adv-to","rối ren | lộn xộn | tới tấp | nhao nhao | tản mác (議論紛々)","confused | scattered | diverse","1689370"),
    ("平衡感覚","へいこうかんかく","n","cảm giác thăng bằng | khả năng giữ cân bằng | sự cân đối","a sense of equilibrium | a sense of balance","1507320"),
    ("平仄","ひょうそく","n","bằng trắc | luật bằng trắc (thơ Hán) | tính nhất quán (平仄が合う)","tonal meter (in Chinese poetry) | consistency","1508250"),
    ("平生","へいぜい","adj-no|n|adv","thường ngày | bình thường | thường nhật | lúc bình thường","usual | ordinary | everyday","1507510"),
    ("碧空","へきくう","n","trời xanh | bầu trời biếc | thanh không","the blue sky | the azure sky","1509400"),
    ("碧眼","へきがん","n","mắt xanh | người mắt xanh (người phương Tây) (紅毛碧眼)","blue eyes","1509380"),
    ("別懇","べっこん","adj-na|n","thân thiết | chí thân | thâm giao | thân tình đặc biệt","intimacy | close friendship","1509780"),
    ("別状","べつじょう","n","điều bất thường | sự cố | tình trạng nguy kịch (命に別状ない)","something wrong | a serious condition","1509910"),
    ("扁額","へんがく","n","bức hoành phi | biển treo (trên cổng, xà nhà) | bảng chữ trang trí","a framed picture or motto (hung horizontally)","1567130"),
    ("変死","へんし","n|vs|vi","chết bất thường | chết bất đắc kỳ tử | tử vong do tai nạn/bạo lực","an unnatural death | a violent death","1511080"),
    ("返戻金","へんれいきん","n","tiền hoàn lại | tiền hủy hợp đồng | khoản chi trả khi đáo hạn (bảo hiểm)","a payout on cancellation of contract","2061340"),
    ("変容","へんよう","n|vs|vt|vi","biến đổi diện mạo | thay hình đổi dạng | chuyển biến | biến dạng","a change in appearance | transformation","1511520"),
    ("変名","へんめい","n|vs|vt|vi","tên giả | bí danh | biệt hiệu | đổi tên","an assumed name | an alias","1511510"),
    ("偏頗","へんぱ","adj-na|n","thiên vị | bất công | thiên lệch | thành kiến | bè phái","favoritism | partiality | discrimination","1510560"),
    ("扁平","へんぺい","adj-na|n","dẹt | bẹt | phẳng | dẹp (扁平足: bàn chân bẹt)","flat","1567200"),
    ("変貌","へんぼう","n|vs|vi","biến đổi diện mạo | thay đổi hình hài | đổi khác hoàn toàn | lột xác","transfiguration | transformation","1511500"),
    ("忘我","ぼうが","n|adj-no","quên mình | xuất thần | mê li | ngây ngất | mải mê quên hết","trance | ecstasy | rapture","1519250"),
    ("茫漠","ぼうばく","adj-t|adv-to","mênh mông | bao la | mơ hồ | mịt mờ | rộng lớn vô định","vast | boundless | vague | obscure","1909010"),
    ("法悦","ほうえつ","n","pháp duyệt | niềm vui đạo pháp | trạng thái mê đắm | ngất ngây","religious ecstasy | rapture","1517190"),
    ("方寸","ほうすん","n","một tấc vuông | tấc lòng | trong tâm | nơi đặt trái tim (方寸の地)","a square sun | one's mind","1709850"),
    ("放胆","ほうたん","adj-na|n","táo bạo | gan dạ | bạo dạn | không sợ hãi","boldness | fearlessness","1710460"),
    ("飽満","ほうまん","n|vs|vi","no nê | thừa mứa | no đủ | chán chê (chán vì quá đủ)","satiety | surfeit","1627300"),
    ("放浪","ほうろう","n|vs|vi|adj-no","lang bạt | phiêu bạt | rong ruổi | lưu lạc | ngao du đó đây","wandering | roaming | drifting","1516900"),
    ("朴直","ぼくちょく","adj-na|n","chất phác | thật thà | mộc mạc | ngay thẳng giản dị","simplicity | honesty | naivete","1521740"),
    ("墨守","ぼくしゅ","n|vs|vt","khư khư giữ lệ cũ | cố thủ tập quán | bám chặt truyền thống | bảo thủ","rigidly adhering to custom or tradition","1521570"),
    ("木鐸","ぼくたく","n","chuông gỗ | người dẫn dắt dư luận | bậc khai sáng quần chúng (社会の木鐸)","a leader or guide of the public","1807760"),
    ("菩提心","ぼだいしん","n","bồ đề tâm | tâm hướng Phật | chí nguyện cầu giác ngộ","aspiration for Buddhahood","1826560"),
    ("没義道","もぎどう","n|adj-na","tàn bạo | vô nhân đạo | bất nghĩa | nhẫn tâm","brutality | inhumanity","2514650"),
    ("没交渉","ぼっこうしょう","adj-na|n","không liên quan | không dính líu | độc lập tách biệt | tuyệt giao","lack of relation | independence","1521980"),
    ("仏様","ほとけさま","n","Đức Phật | tượng Phật | người đã khuất (kính ngữ)","a Buddha | a deceased person","1502360"),
    ("凡愚","ぼんぐ","adj-na|n","phàm phu ngu muội | kẻ tầm thường ngốc nghếch | người trần thiển cận","a foolish, common person","1523490"),
    ("翻然","ほんぜん","adv-to|adj-t","đột nhiên (tỉnh ngộ) | bất chợt thay đổi | phấp phới (cờ bay)","suddenly (changing one's mind) | fluttering","1843140"),
    ("煩瑣","はんさ","adj-na|n","rắc rối | phiền toái | rườm rà | lôi thôi nhiêu khê","vexatious | troublesome | complicated","1615370"),
    ("奔流","ほんりゅう","n","dòng nước xiết | thác lũ cuồn cuộn | dòng chảy dữ dội | thế nước mãnh liệt","a torrent | a rushing stream","1522140"),
    ("摩天楼","まてんろう","n","tòa nhà chọc trời | cao ốc | nhà cao tầng ngất trời","a skyscraper","1523850"),
    ("末梢","まっしょう","n","ngọn cành | đầu mút | chi tiết vụn vặt | ngoại biên (末梢神経)","the tip of a twig | trivial details | peripheral","1525440"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
