# -*- coding: utf-8 -*-
"""Build N1 ready wave 064 — literary verbs (set 64)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-064.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("際立つ","きわだつ","v5t|vi","nổi bật | nổi trội | đặc biệt nổi bật | gây ấn tượng | rõ rệt","to be prominent | to stand out | to be striking","1296360"),
    ("極まる","きわまる","v5r|vi","đến cực điểm | tột cùng | hết mức | bế tắc | lâm vào thế bí","to reach an extreme | to be in a dilemma","1591960"),
    ("括る","くくる","v5r|vt","buộc lại | bó lại | gói gọn | tổng kết | ước lượng | thắt (cổ)","to tie up | to bundle | to summarize","1208230"),
    ("挫く","くじく","v5k|vt","bong gân | trẹo | làm nhụt chí | dập tắt (nhiệt huyết) | bẻ gãy","to sprain | to dampen (enthusiasm) | to discourage","1292010"),
    ("組み敷く","くみしく","v5k|vt","đè xuống | ghì xuống | vật ngã đè chặt | khống chế","to press down | to hold down | to pin down","1592300"),
    ("汲む","くむ","v5m|vt","múc (nước) | gạn | rót | thấu hiểu (tâm tư) | thông cảm | kế thừa","to draw (water) | to consider (feelings) | to understand","1229610"),
    ("酌む","くむ","v5m|vt","rót (rượu) | chuốc rượu | uống cùng | thấu hiểu | cảm thông (心を酌む)","to pour (sake) | to consider (feelings)","1324210"),
    ("燻る","くすぶる","v5r|vi","âm ỉ | bốc khói | ngún | dai dẳng (tranh chấp) | sống ẩn dật | giậm chân tại chỗ","to smoulder | to seclude oneself | to live in obscurity","1592180"),
    ("崩れ落ちる","くずれおちる","v1|vi","đổ sụp | sụp đổ | đổ ập xuống | rơi rụng | sạt lở","to crumble down | to tumble down","1640650"),
    ("括り付ける","くくりつける","v1|vt","buộc chặt vào | trói vào | cột vào | gắn chặt","to fasten to | to tie to | to bind","1208220"),
    ("暮れなずむ","くれなずむ","v5m|vi","trời nhá nhem | hoàng hôn buông chậm | trời tối dần | chạng vạng kéo dài","to grow dark slowly (at dusk)","1670850"),
    ("咥える","くわえる","v1|vt","ngậm (trong miệng) | cắp | tha đi | mang theo","to hold in one's mouth","1609730"),
    ("扱く","しごく","v5k|vt|vi","vuốt (râu) | tuốt | bắt làm việc cật lực | rèn giũa khắc nghiệt | luyện gắt","to stroke | to work someone hard | to train harshly","1153460"),
    ("拗らせる","こじらせる","v1|vt","làm phức tạp | làm rối thêm | làm trầm trọng | khiến nặng thêm (bệnh)","to aggravate | to complicate | to make worse","2008060"),
    ("拵える","こしらえる","v1|vt","làm | chế tạo | chuẩn bị | dựng nên | trang điểm | bịa ra | xoay (tiền)","to make | to prepare | to fabricate (a story)","1567390"),
    ("誤魔化す","ごまかす","v5s|vt","đánh lừa | che giấu | làm giả | lấp liếm | trốn tránh | qua mặt | gian lận","to deceive | to falsify | to gloss over | to evade","1271480"),
    ("凝らす","こらす","v5s|vt","tập trung | dồn (tâm sức) | chăm chú | dốc công | căng (mắt) (工夫を凝らす)","to concentrate | to focus | to devote","1239010"),
    ("懲らしめる","こらしめる","v1|vt","trừng trị | trừng phạt | dạy cho bài học | răn đe | trị tội","to chastise | to punish | to discipline","1428170"),
    ("拗れる","こじれる","v1|vi","trở nên phức tạp | rối rắm | xấu đi | trầm trọng thêm | trục trặc","to get complicated | to grow worse | to turn sour","1567270"),
    ("殺める","あやめる","v1|vt","sát hại | giết | gây thương tích | làm bị thương | hạ sát","to wound | to murder","1218420"),
    ("恋い慕う","こいしたう","v5u|vt","thương nhớ | si mê | tương tư | yêu thương khao khát","to miss | to yearn for","1558700"),
    ("強請る","ねだる","v5r|vt","vòi vĩnh | nài nỉ | mè nheo đòi | nằng nặc xin | làm nũng đòi","to beg | to pester | to coax","1236410"),
    ("忽せ","ゆるがせ","adj-na","lơ là | xem nhẹ | cẩu thả | sơ suất | thờ ơ (忽せにする)","negligent | careless | easygoing","2832541"),
    ("比丘","びく","n","tỳ kheo | nhà sư thọ giới đầy đủ | tăng sĩ (比丘尼: tỳ kheo ni)","a bhikkhu (ordained Buddhist monk)","1621910"),
    ("遡る","さかのぼる","v5r|vi","ngược dòng | quay về quá khứ | truy ngược | hồi tố | lần về nguồn cội","to go upstream | to go back (to the past) | to trace back","1397830"),
    ("差し控える","さしひかえる","v1|vt|vi","kiêng dè | hạn chế | tiết chế | xin phép không (nói/làm) | nán lại bên cạnh","to refrain (from doing) | to withhold | to be moderate","1291160"),
    ("拐かす","かどわかす","v5s|vt","bắt cóc | dụ dỗ bắt đi | cưỡng đoạt người | dụ bắt","to kidnap | to abduct","1590530"),
    ("強奪","ごうだつ","n|vs|vt","cướp đoạt | cướp giật | tước đoạt | cưỡng đoạt | chiếm đoạt","robbery | seizure | plunder","1236460"),
    ("僻む","ひがむ","v5m","tự ti | mặc cảm | nghĩ tiêu cực | hay tủi thân | thành kiến | đố kỵ","to have a warped view | to feel unfairly treated | to be jealous","1509110"),
    ("聳える","そびえる","v1|vi","sừng sững | vươn cao | cao chót vót | đứng sừng sững","to rise (of a building) | to tower | to soar","1570770"),
    ("逸る","はやる","v5r|vi","nôn nóng | sốt ruột | hăng máu | bồn chồn | hấp tấp háo hức","to be impatient | to be eager | to be rash","1637460"),
    ("晴れ晴れ","はればれ","adv|adv-to|vs","tươi tỉnh | rạng rỡ | sảng khoái | quang đãng | phấn chấn (晴れ晴れとした気分)","bright | cheerful | clear (sky)","1750800"),
    ("憚る","はばかる","v5r|vt|vi","e ngại | ngần ngại | kiêng dè | sợ điều tiếng | lộng hành lấn lướt","to hesitate | to be afraid of what others think | to lord it over","1631520"),
    ("食む","はむ","v5m|vt","ăn (cỏ) | gặm | nhận (lương bổng) | hưởng bổng lộc","to eat (grass) | to receive (a salary)","2145650"),
    ("綻びる","ほころびる","v1|vi","sút chỉ | bung chỉ | hé nở | chớm nở | nở nụ cười rạng rỡ","to come apart at the seams | to begin to bloom | to smile","1419000"),
    ("解れる","ほぐれる","v1|vi","tháo ra | gỡ ra | dịu lại | thư giãn | mềm ra | giãn ra (緊張がほぐれる)","to come untied | to be relaxed | to be softened","1198940"),
    ("綻ぶ","ほころぶ","v5b|vi","hé nở | chớm nở | bung chỉ | nở nụ cười | mỉm cười tươi","to begin to bloom | to smile broadly | to come apart","2523720"),
    ("微睡む","まどろむ","v5m|vi","thiu thiu ngủ | ngủ gà ngủ gật | chợp mắt | lim dim","to doze off","1486080"),
    ("免れる","まぬがれる","v1|vt","thoát khỏi | tránh được | thoát nạn | né tránh (trách nhiệm) | miễn","to escape (disaster) | to avoid | to evade","1584670"),
    ("紛らす","まぎらす","v5s|vt","khuây khỏa | đánh lạc hướng | giải khuây | che giấu | lảng tránh (chủ đề)","to divert | to distract | to conceal","1504980"),
    ("免ずる","めんずる","vz|vt","miễn | bãi (chức) | tha thứ | miễn cho | nể mặt mà bỏ qua","to dismiss | to exempt | to excuse from","1533080"),
    ("申し受ける","もうしうける","v1|vt","xin nhận | nhận (đặt hàng) | thu (phí) | tiếp nhận | đề nghị tính phí","to charge (a price) | to accept (orders)","1362910"),
    ("悶える","もだえる","v1|vi","quằn quại | đau đớn vật vã | dằn vặt | khổ sở | giãy giụa đau đớn","to writhe (in pain) | to be in agony","1536080"),
    ("靡く","なびく","v5k|vi","phất phơ | lả lướt | nghiêng theo | xiêu lòng | quy thuận | ngả theo","to flutter | to bend | to yield to | to be swayed by","1575320"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
