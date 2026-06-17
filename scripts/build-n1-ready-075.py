# -*- coding: utf-8 -*-
"""Build N1 ready wave 075 — 慣用句 idiomatic expressions (set 75)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-075.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("足が地に着かない","あしがちにつかない","exp","như đi trên mây | lâng lâng phấn khích | mất bình tĩnh | bay bổng hấp tấp","walking on air | losing oneself (in excitement)","2119580"),
    ("頭が固い","あたまがかたい","exp|adj-i","đầu óc cứng nhắc | bảo thủ | cố chấp | thiếu linh hoạt | gàn dở","thickheaded | obstinate | inflexible","1856520"),
    ("頭が切れる","あたまがきれる","exp|v1","đầu óc sắc bén | nhanh trí | thông minh sắc sảo | lanh lợi","to be sharp | to be clever | to be on the ball","2411170"),
    ("息が詰まる","いきがつまる","exp|v5r","nghẹt thở | ngột ngạt | căng thẳng đến nghẹt thở | khó thở","to choke | to feel suffocated","2191440"),
    ("息を凝らす","いきをこらす","exp|v5s","nín thở | nén hơi thở | nín thở chờ đợi | nín thở căng thẳng","to hold one's breath","2835904"),
    ("裏目","うらめ","n","mặt trái | kết quả ngược | mặt sau (xúc xắc) | mũi đan trái (裏目に出る)","the reverse side | the opposite (of expected)","1550710"),
    ("大目玉を食う","おおめだまをくう","exp|v5u","bị mắng nặng | ăn một trận mắng | bị khiển trách nghiêm khắc","to get scolded severely","2859287"),
    ("お茶の子さいさい","おちゃのこさいさい","n","dễ như trở bàn tay | chuyện nhỏ | dễ ợt | ngon ơ | dễ như ăn kẹo","an easy task | a piece of cake","2777330"),
    ("顔が売れる","かおがうれる","exp|v1","nổi tiếng | có tiếng tăm | được nhiều người biết đến | nổi danh","to become widely recognized | to be famous","2839877"),
    ("顔を貸す","かおをかす","exp|v5s","dành chút thời gian gặp | nể mặt cho gặp | bớt chút thời gian | đến gặp giúp","to grant a person a moment | to make an appearance","2102760"),
    ("肩で風を切る","かたでかぜをきる","exp|v5r","nghênh ngang | vênh vang sải bước | đi đứng oai vệ | dáng đầy tự tin","to swagger | to strut confidently","2102890"),
    ("気が滅入る","きがめいる","exp|v5r","chán nản | u sầu | tâm trạng đi xuống | rầu rĩ | nản lòng","to feel depressed | to be down","2266670"),
    ("口が軽い","くちがかるい","exp|adj-i","lắm mồm | hớ hênh | không giữ được bí mật | nói không suy nghĩ | mau miệng","having a loose tongue | being talkative","1275680"),
    ("口に合う","くちにあう","exp|v5u","hợp khẩu vị | vừa miệng | đúng gu ăn uống | ngon miệng","to suit one's taste | to be palatable","1872140"),
    ("心を鬼にする","こころをおににする","exp|vs-i","nhẫn tâm | cứng rắn lòng | dằn lòng | nén tình cảm | tàn nhẫn để tốt cho người","to harden one's heart | to steel oneself","2124890"),
    ("腰を抜かす","こしをぬかす","exp|v5s","sợ rụng rời | khuỵu chân vì sợ | đứng không vững (vì kinh ngạc/sợ)","to be unable to stand from fear or surprise","2423680"),
    ("言葉を濁す","ことばをにごす","exp|v5s","nói lấp lửng | ậm ừ | nói mập mờ | tránh né | không nói rõ","to be vague | to speak ambiguously | to be evasive","1877050"),
    ("尻尾を出す","しっぽをだす","exp|v5s","lòi đuôi | lộ tẩy | để lộ chân tướng | hớ hênh để lộ sơ hở","to show one's true colors | to give oneself away","2118320"),
    ("尻尾を掴む","しっぽをつかむ","exp|v5m","nắm thóp | bắt được điểm yếu | tóm được chứng cứ | nắm đằng chuôi","to catch someone out | to get evidence on someone","2779510"),
    ("精を出す","せいをだす","exp|v5s","dốc sức | nỗ lực | làm việc chăm chỉ | gắng hết mình | cần mẫn","to work hard | to do one's best","1888080"),
    ("背を向ける","せをむける","exp|v1","quay lưng | ngoảnh mặt làm ngơ | phớt lờ | từ chối quan tâm","to turn one's back on | to pretend not to see","1888660"),
    ("たがが緩む","たががゆるむ","exp|v5m","lơ là | chùng xuống | mất kỷ luật | giảm căng thẳng | lỏng lẻo (ý chí)","to become lax (of discipline) | to lose one's edge","2833545"),
    ("血が通う","ちがかよう","exp|v5u","có tình người | có hơi ấm con người | nhân văn | còn sống động","to be humane | to show signs of humanity","2821290"),
    ("血の気が引く","ちのけがひく","exp|v5k","mặt tái mét | tái xanh | mất sắc | trắng bệch (vì sợ)","to go pale | to lose color","2543110"),
    ("血の気が多い","ちのけがおおい","exp|adj-i","máu nóng | bốc đồng | nóng nảy | hăng máu | dễ kích động","hot-blooded | hot-headed | impulsive","2860120"),
    ("手に汗を握る","てにあせをにぎる","exp|v5r","nắm tay đẫm mồ hôi | hồi hộp nín thở | thót tim | căng thẳng theo dõi","to be in breathless suspense | to be on the edge of one's seat","2117950"),
    ("手のひらを返す","てのひらをかえす","exp|v5s","trở mặt | thay đổi thái độ 180 độ | lật mặt | trở giọng nhanh chóng","to do an about-face | to flip-flop","2068440"),
    ("手も無く","てもなく","adv","dễ dàng | không tốn sức | nhẹ nhàng | dễ như chơi","easily | without effort","1327270"),
    ("手を変え品を変え","てをかえしなをかえ","exp|adv","đủ mọi cách | bằng mọi thủ đoạn | xoay đủ kiểu | trăm phương ngàn kế","by hook or by crook | by all possible means","1895950"),
    ("泣きべそ","なきべそ","n","mặt mếu máo | mặt nhăn nhó sắp khóc | bộ dạng chực khóc | rưng rưng","a face contorted and about to cry","2056360"),
    ("喉を鳴らす","のどをならす","exp|v5s","kêu ư ử trong cổ | (mèo) gừ gừ | tặc lưỡi thèm thuồng | phát tiếng từ họng","to purr (of a cat) | to make a sound in one's throat","2829466"),
    ("歯が立つ","はがたつ","exp|v5t","kham nổi | địch được | đối phó được | nhằm nhò gì | nhai được","to be within one's capabilities | to be manageable","2853139"),
    ("歯切れがいい","はぎれがいい","exp|adj-ix","rõ ràng dứt khoát | mạch lạc | gãy gọn | giòn giã | rành rọt","crisp | clear | staccato","2850271"),
    ("膝が笑う","ひざがわらう","exp|v5u","run đầu gối | chân muốn khuỵu | mỏi run chân (sau leo dốc/mệt)","to have one's knees about to give way","2419510"),
    ("人を見る目","ひとをみるめ","exp|n","con mắt nhìn người | khả năng đánh giá con người | tài xem tướng người","an eye for people | ability to judge character","2401980"),
    ("火に油を注ぐ","ひにあぶらをそそぐ","exp|v5g","đổ thêm dầu vào lửa | làm tình hình tệ hơn | khích cho nóng thêm","to add fuel to the fire | to make things worse","2145230"),
    ("腑に落ちる","ふにおちる","exp|v1","thông suốt | hiểu ra | thấy thuyết phục | thông tỏ | thấy hợp lý","to understand | to be convinced","2759210"),
    ("骨を埋める","ほねをうずめる","exp|v1","gửi gắm cả đời | chôn thân nơi (đâu) | cống hiến trọn đời | gắn bó đến hết đời","to make a place one's final home | to devote one's life to","1908590"),
    ("胸に刻む","むねにきざむ","exp|v5m","khắc ghi trong lòng | tạc dạ | ghi nhớ sâu sắc | ghi lòng tạc dạ","to keep in one's mind | to take to heart","2861571"),
    ("胸を打つ","むねをうつ","exp|v5t","lay động lòng người | cảm động | chạm đến trái tim | xúc động","to be touching | to be moving","2211580"),
    ("目から火が出る","めからひがでる","exp|v1","tóe đom đóm mắt | hoa cả mắt (bị đập đầu) | nảy đom đóm","to see stars (after a blow to the head)","1535070"),
    ("目が肥える","めがこえる","exp|v1","có con mắt tinh tường | sành sỏi (do xem nhiều) | mắt thẩm mỹ cao | tinh đời","to have a discerning eye | to be a connoisseur","2259680"),
    ("目が利く","めがきく","exp|v5k","có con mắt nhà nghề | giỏi nhận biết | tinh mắt | sành","to have an eye for","1911780"),
    ("目に物見せる","めにものみせる","exp|v1","cho biết tay | dạy cho bài học | cho mở mắt | cho biết lợi hại","to teach someone a lesson | to show what one can do","2118970"),
    ("目をくらます","めをくらます","exp|v5s","đánh lừa | che mắt | qua mắt | làm hoa mắt | bịt mắt","to deceive | to blind the eyes of","1912040"),
    ("目を細める","めをほそめる","exp|v1","híp mắt | nheo mắt | cười tít mắt | nhìn trìu mến | mắt rạng rỡ vui","to squint | to smile fondly","2152320"),
    ("目を回す","めをまわす","exp|v5s","hoa mắt | choáng váng | ngất xỉu | sửng sốt | bận tối mắt","to faint | to be astounded | to have a hectic time","2779100"),
    ("焼きを入れる","やきをいれる","exp|v1","tôi luyện | rèn cứng | trừng trị | dạy dỗ nghiêm khắc | tra tấn","to temper | to discipline harshly","1912910"),
    ("夜を徹する","よをてっする","exp|vs-s","thức trắng đêm | thâu đêm suốt sáng | làm việc suốt đêm","to stay up all night","2761660"),
    ("我先に","われさきに","adv","tranh nhau lên trước | giành phần đầu | chen lấn xô đẩy | ai cũng muốn nhất","striving to be first | scrambling for","1196870"),
    ("足を棒にする","あしをぼうにする","exp|vs-i","đi mỏi rã chân | cuốc bộ đến rụng chân | đi đến kiệt sức","to walk until one's legs feel like lead","2226240"),
    ("頭をもたげる","あたまをもたげる","exp|v1","ngóc đầu dậy | nổi lên | trỗi dậy | nhen nhóm | dần lộ rõ","to come to the fore | to rear its head","2423620"),
    ("息を弾ませる","いきをはずませる","exp|v1","thở hổn hển | thở dồn dập | hồ hởi phấn khích | hổn hển vì xúc động","to pant | to be short of breath (from excitement)","1404370"),
    ("意地を張る","いじをはる","exp|v5r","cố chấp | bướng bỉnh | giữ khư khư ý mình | ngoan cố không nhượng","to be obstinate | to be stubborn","1632820"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
