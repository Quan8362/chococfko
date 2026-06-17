# -*- coding: utf-8 -*-
"""Build N1 ready wave 060 — literary 漢語 (set 60)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-060.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("末代","まつだい","n","muôn đời sau | đời đời | hậu thế | vạn đại (名を末代に残す)","all generations to come | eternity","1525520"),
    ("末葉","まつよう","n","cuối thời kỳ | cuối thế kỷ | hậu duệ | con cháu đời sau","the end (of an era) | a descendant","1584410"),
    ("味到","みとう","n|vs|vt","thưởng thức trọn vẹn | thấu hiểu sâu sắc | cảm nhận tinh tế (tác phẩm)","appreciating fully","2833174"),
    ("身代","しんだい","n","cơ nghiệp | tài sản | gia sản | của cải | sản nghiệp","one's fortune | one's property","1646750"),
    ("未踏","みとう","adj-no|n","chưa ai đặt chân | chưa khám phá | hoang sơ | nguyên vẹn (人跡未踏)","untrodden | unexplored","1604600"),
    ("妙趣","みょうしゅ","n","nét đẹp tinh tế | vẻ duyên dáng huyền diệu | thú vị tao nhã","exquisite beauty or charm","1810150"),
    ("妙齢","みょうれい","adj-no|n","tuổi xuân thì | tuổi cập kê | đương độ thanh xuân | tuổi dậy thì (nữ)","the prime of youth | marriageable age (of a woman)","1621000"),
    ("未了","みりょう","n|adj-no","chưa xong | dang dở | chưa hoàn tất | chưa thực hiện (審議未了)","unfinished | unexecuted","1528120"),
    ("無尽蔵","むじんぞう","n|adj-no|adj-na","vô tận | không bao giờ cạn | nguồn cung bất tận | vô cùng vô tận","an inexhaustible supply","1530240"),
    ("無人","むじん","adj-no|n|adj-na","không người | vô nhân | tự động không người lái | hoang vắng (無人島)","unmanned | uninhabited | deserted","1530220"),
    ("無体","むたい","adj-na|n","vô hình | phi vật chất | vô lý | ngang ngược | cưỡng ép (無体な要求)","intangible | unreasonable | preposterous","1672080"),
    ("無聊","ぶりょう","n|adj-na","buồn chán | tẻ nhạt | rảnh rỗi buồn tẻ | bất mãn uể oải (無聊を慰める)","boredom | ennui | tedium","1673070"),
    ("胸突き八丁","むなつきはっちょう","n","chặng gian nan nhất | đoạn dốc cam go | giai đoạn khó khăn nhất | thử thách cuối","the most trying period | the toughest stretch","1677850"),
    ("明察","めいさつ","n|vs|vt","sáng suốt | nhận định tinh tường | thấu suốt | cao kiến (kính ngữ)","keen insight | discernment","1532460"),
    ("鳴動","めいどう","n|vs|vi","rền vang | rung chuyển ầm ầm | gầm vang | chấn động (大山鳴動)","rumbling | a ringing cadence","1532920"),
    ("明眸","めいぼう","n","đôi mắt sáng đẹp | mắt long lanh | minh mâu (明眸皓歯)","bright, beautiful eyes","1651630"),
    ("酩酊","めいてい","n|vs|vi","say khướt | say mèm | say bí tỉ | ngà ngà say","drunkenness | intoxication","1573740"),
    ("滅却","めっきゃく","n|vs|vt|vi","diệt trừ | xóa sạch | tiêu diệt | tận diệt (心頭滅却)","extinguishment | destruction | effacement","1532970"),
    ("滅相","めっそう","adj-na|n","vô lý | quá đáng | bậy bạ | (滅相もない: đâu có, không dám)","extravagant | absurd","1833000"),
    ("免罪符","めんざいふ","n","bùa xá tội | giấy xá tội (Công giáo) | cái cớ để biện minh | sự bao biện","an indulgence | an excuse | a justification","1533180"),
    ("面妖","めんよう","adj-na|n","kỳ quái | lạ lùng | bí hiểm | quái lạ","weird | strange | mysterious","1812210"),
    ("妄想狂","もうそうきょう","n","chứng hoang tưởng | bệnh đa nghi | chứng paranoia","paranoia","2869361"),
    ("盲従","もうじゅう","n|vs|vi","mù quáng tuân theo | phục tùng mù quáng | nhắm mắt nghe theo","blind obedience","1534190"),
    ("申し子","もうしご","n","đứa con trời ban (cầu mà được) | sản phẩm của thời đại | hiện thân (時代の申し子)","a heaven-sent child | a product (of an era)","1362900"),
    ("妄評","ぼうひょう","n|vs|vt","lời phê bình hồ đồ | nhận xét bừa | chê bai vô căn cứ | lời lẽ xằng bậy","unfair criticism | abusive remarks","1584750"),
    ("木目","もくめ","n","vân gỗ | thớ gỗ | đường vân gỗ","the grain of wood","1584770"),
    ("黙考","もっこう","n|vs|vi","trầm tư | suy ngẫm lặng lẽ | nghiền ngẫm im lặng (沈思黙考)","contemplation | silent meditation","1534950"),
    ("黙過","もっか","n|vs|vt","làm ngơ | bỏ qua trong im lặng | ngầm chấp thuận | mặc nhiên cho qua","tacit approval | overlooking silently","1773460"),
    ("黙々","もくもく","adj-t|adv-to","lặng lẽ | âm thầm | im lặng | cặm cụi không nói (黙々と働く)","silent | mute | working without a word","1605200"),
    ("門戸開放","もんこかいほう","n|adj-no","mở cửa | chính sách mở cửa | rộng mở giao thương","an open-door policy","2032880"),
    ("悶々","もんもん","adj-t|adv-to|vs","day dứt | khắc khoải | trằn trọc | bứt rứt khổ tâm (悶々とする)","anguished | distressed | worried","1605350"),
    ("野合","やごう","n|vs|vi","kết hợp bất chính | cấu kết | thông đồng | liên minh mờ ám","an illicit union | collusion","1711920"),
    ("焼き直し","やきなおし","n|vs|vt","hâm lại | làm lại | xào nấu lại | cải biên cũ kỹ | bổn cũ soạn lại","reheating | a rehash | a remake","1912880"),
    ("山勘","やまかん","n","sự đoán mò | sự ăn may | phỏng đoán liều | linh cảm","guesswork | a hunch","1755400"),
    ("野次馬","やじうま","n","kẻ hiếu kỳ | đám đông tò mò | kẻ xem hóng | người bu xem","curious onlookers | rubberneckers","1711930"),
    ("野心家","やしんか","n","kẻ đầy tham vọng | người tham vọng lớn | kẻ nhiều mưu đồ","an ambitious person","1537440"),
    ("山姥","やまうば","n","yêu bà trong núi | phù thủy núi | bà già núi (yêu quái)","a mountain witch | yamauba","1755320"),
    ("闇夜","やみよ","n","đêm tối | đêm không trăng | đêm đen mịt mùng","a dark, moonless night","1575850"),
    ("山師","やまし","n","kẻ đầu cơ | tay lừa đảo | kẻ mạo hiểm | người dò khoáng | kẻ bịp bợm","a speculator | an imposter | a prospector","1302880"),
    ("野郎","やろう","n|pn","thằng cha | gã | tên kia | đồ khốn | thằng chó (chửi thề)","a guy | a fellow | a bastard","1537700"),
    ("夕映え","ゆうばえ","n","ráng chiều | ánh hoàng hôn rực rỡ | ráng đỏ chiều tà","the glow of sunset","1542680"),
    ("幽冥","ゆうめい","n","cõi âm u | u minh | âm phủ | thế giới bên kia | tranh tối tranh sáng","semidarkness | hades | the other world","1605690"),
    ("勇姿","ゆうし","n","dáng vẻ oai hùng | hình ảnh dũng mãnh | tư thế hiên ngang | dáng anh dũng","a brave, valiant figure","2842775"),
    ("有終","ゆうしゅう","n","kết thúc trọn vẹn | hoàn thành đến cùng | về đích viên mãn (有終の美)","carrying through to a perfect end","1541380"),
    ("猶子","ゆうし","n","con nuôi | cháu coi như con | đứa con kế tự","an adopted child | a nephew treated as a son","1541720"),
    ("誘蛾灯","ゆうがとう","n","đèn bẫy côn trùng | đèn dụ bướm đêm | đèn diệt sâu bọ","a light trap (for insects)","1653320"),
    ("猶予期間","ゆうよきかん","n","thời gian ân hạn | kỳ gia hạn | thời gian hoãn | thời hạn miễn trừ","a grace period | a moratorium","1696860"),
    ("百合","ゆり","n","hoa loa kèn | hoa bách hợp | hoa huệ tây | yuri (thể loại truyện)","a lily","1488160"),
    ("妖怪変化","ようかいへんげ","n","yêu ma quỷ quái | yêu quái biến hóa | quái vật ghê rợn","a monstrous apparition | a terrifying creature","1818810"),
    ("庸君","ようくん","n","hôn quân | vua tầm thường ngu muội | bậc quân vương kém cỏi","a stupid ruler","1914470"),
    ("要訣","ようけつ","n","yếu quyết | điểm cốt yếu | bí quyết then chốt | mấu chốt","the main point | the key secret","1836210"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
