# -*- coding: utf-8 -*-
"""Build N1 ready wave 024 — literary/formal Sino-Japanese nouns (set 24)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-024.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("符合","ふごう","n|vs|vi","trùng khớp | ăn khớp | phù hợp | tương ứng","agreement | coincidence | correspondence","1497750"),
    ("俯瞰","ふかん","n|vs|vt","nhìn từ trên cao | nhìn bao quát | toàn cảnh | góc nhìn tổng thể","overlooking | bird's-eye view","1563670"),
    ("不興","ふきょう","adj-na|n","phật ý | không vui | mất hứng | bực bội","displeasure | ill humour | pique","1491960"),
    ("腐心","ふしん","n|vs|vi","dày công | hao tâm tổn trí | vắt óc | dốc sức lo toan","taking great pains | racking one's brains","1497850"),
    ("不肖","ふしょう","adj-no|adj-na|n|pn","bất tài (khiêm) | kẻ hèn này | bất tiếu | kém cỏi | con bất hiếu","unworthy | I/me (humble) | incompetent","1492940"),
    ("無精","ぶしょう","n|vs|adj-na","lười nhác | biếng nhác | lười biếng | uể oải","indolence | laziness | sloth","1603150"),
    ("扶植","ふしょく","n|vs","gây dựng | thiết lập | cấy ghép (thế lực) | tạo dựng","implantation | establishment","1690970"),
    ("侮蔑","ぶべつ","n|vs|vt","khinh miệt | coi thường | khinh bỉ | xem thường","scorn | disdain | contempt","1498270"),
    ("不分明","ふぶんめい","adj-na","không rõ ràng | mơ hồ | mập mờ | thiếu minh bạch","obscure | vague","1615270"),
    ("不文","ふぶん","adj-no|n","bất thành văn | không thành văn | thất học | viết kém","unwritten | illiterate | uneducated","1494750"),
    ("不慮","ふりょ","adj-no|n","bất ngờ | ngoài dự kiến | đột ngột | tai bay vạ gió","unforeseen | unexpected | accidental","1495280"),
    ("浮揚","ふよう","n|vs|vi","nổi lên | bồng bềnh | vực dậy (kinh tế) | nâng đỡ","floating | buoyancy | buoying up","1497570"),
    ("紛擾","ふんじょう","n|vs|vi","rối ren | lộn xộn | tranh chấp | rắc rối","disturbance | trouble | dispute","1689390"),
    ("焚書","ふんしょ","n|vs|vi","đốt sách | phần thư | thiêu hủy sách vở","book burning","1624910"),
    ("噴飯","ふんぱん","n|vs|vi","buồn cười phun cơm | bật cười | nực cười (噴飯もの)","bursting out laughing","1616800"),
    ("分明","ふんみょう","adj-na|n","rõ ràng | minh bạch | sáng tỏ | rành mạch","clearness | clear understanding","1583820"),
    ("平癒","へいゆ","n|vs|vi","bình phục | khỏi bệnh | hồi phục | lành bệnh","recovery | convalescence","1508040"),
    ("別離","べつり","n|vs","ly biệt | chia tay | chia ly | tách biệt","parting | separation","1510220"),
    ("変幻","へんげん","n|vs|vi","biến hóa | thay hình đổi dạng | biến ảo khôn lường","transformation","1511010"),
    ("遍歴","へんれき","n|vs|vi","chu du | ngao du | từng trải | bôn ba nhiều nơi","travels | pilgrimage | accumulated experiences","1512340"),
    ("返戻","へんれい","n|vs|vt","trả lại | hoàn trả | gửi trả","returning | giving back","1617090"),
    ("萌芽","ほうが","n|vs|vi","nảy mầm | mầm mống | dấu hiệu khởi đầu | manh nha","germination | sprout | early sign | beginning","1603340"),
    ("彷彿","ほうふつ","n|vs|adj-t|adv-to|vt","gợi nhớ | hao hao giống | phảng phất | mường tượng","close resemblance | vivid reminder | vague","1566710"),
    ("咆哮","ほうこう","n|vs|vi","gầm thét | rống | gào rú | gầm gừ","roar | howl | bellow","1565190"),
    ("鋒鋩","ほうぼう","n","mũi nhọn vũ khí | lời lẽ sắc bén | tính cách gai góc","tip of a blade | sharp words | vicious character","2178060"),
    ("褒貶","ほうへん","n|vs|vt","khen chê | bình phẩm | đánh giá khen ngợi và chỉ trích","praise and censure | criticism","1518060"),
    ("朋輩","ほうばい","n","bằng hữu | đồng môn | bạn đồng nghiệp | bạn học","comrade | friend | colleague | fellow student","1517130"),
    ("反故","ほご","n","giấy lộn | giấy vụn | xé bỏ (反故にする: phế bỏ lời hứa)","wastepaper | scrap paper","1583210"),
    ("菩提","ぼだい","n","bồ đề | giác ngộ | cõi an lạc kiếp sau","bodhi | enlightenment | happiness in the next world","1621940"),
    ("法度","はっと","n","luật cấm | điều cấm kỵ | pháp độ | điều răn (thời trung cổ)","ban | prohibition | taboo | law","1626410"),
    ("辺鄙","へんぴ","adj-na|n","hẻo lánh | xa xôi | heo hút | vùng sâu vùng xa","hard to reach place | remote place","1512120"),
    ("凡例","はんれい","n","lời chú dẫn (đầu sách) | hướng dẫn sử dụng | chú giải | bảng ký hiệu","explanatory notes | usage guide | legend","1523690"),
    ("本懐","ほんかい","n","tâm nguyện | ước nguyện cả đời | hoài bão ấp ủ","one's long-cherished desire","1627370"),
    ("本分","ほんぶん","n","bổn phận | phần việc | trách nhiệm | nghĩa vụ","one's duty | one's part","1627330"),
    ("凡夫","ぼんぷ","n","phàm phu | người trần tục | kẻ chưa giác ngộ | người thường","ordinary person | unenlightened person","1584310"),
    ("眼差し","まなざし","n","ánh mắt | cái nhìn | tia nhìn | ánh nhìn","look | gaze","1217200"),
    ("未遂","みすい","n|n-suf|adj-no","chưa thành | mưu toan bất thành | toan tính dở dang (tội phạm)","failed attempt (at a crime, suicide)","1527650"),
    ("身請け","みうけ","n|vs|vt","chuộc thân | bỏ tiền chuộc (kỹ nữ) | giải thoát khỏi cảnh nô lệ","paying to free someone (geisha, prostitute) from bondage","1706010"),
    ("密議","みつぎ","n|vs|vt|vi","mật nghị | bàn bạc bí mật | họp kín | mưu tính ngầm","secret conference","1731670"),
    ("脈絡","みゃくらく","n","mạch lạc | sự liên kết | mối liên hệ | ngữ cảnh","logical connection | coherence | context","1528470"),
    ("冥加","みょうが","n|adj-na","ơn trời che chở | phúc trời ban | may mắn | thần phù hộ","divine protection | providence | blessed","1753260"),
    ("冥福","めいふく","n","minh phúc | hạnh phúc kiếp sau | cầu cho linh hồn siêu thoát","happiness in the next world | repose of one's soul","1531310"),
    ("未亡人","みぼうじん","n","quả phụ | góa phụ | người vợ góa","widow","1528030"),
    ("無垢","むく","adj-na|adj-no|n","trong trắng | ngây thơ | thuần khiết | không tì vết","pure | innocent | spotless | immaculate","1529950"),
    ("無辜","むこ","adj-no|n","vô tội | vô can | trong sạch | không lỗi lầm","innocent | blameless | guiltless","1673080"),
    ("無双","むそう","n|adj-no|vs","vô song | có một không hai | vô địch | tuyệt luân","peerless | unparalleled | matchless","1530490"),
    ("村八分","むらはちぶ","n","tẩy chay | cô lập | bị cả làng xa lánh | hắt hủi tập thể","ostracism | complete ostracism","1406850"),
    ("明媚","めいび","adj-na|n","tươi đẹp | hữu tình | thơ mộng | (phong cảnh) đẹp như tranh","picturesque (scenery) | beautiful","1674620"),
    ("迷妄","めいもう","n","mê muội | ảo tưởng | hoang tưởng | lầm lạc","illusion | fallacy | delusion","1532780"),
    ("盟主","めいしゅ","n","minh chủ | người đứng đầu liên minh | thủ lĩnh | lãnh đạo","leader (of an alliance) | leading power","1532660"),
    ("目算","もくさん","n|vs","ước tính | tính toán sơ bộ | dự tính | nhẩm tính","rough estimate | expectation | plan","1642000"),
    ("黙礼","もくれい","n|vs|vi","cúi chào lặng lẽ | gật đầu chào | chào thầm","silent bow","1535060"),
    ("紋章","もんしょう","n","huy hiệu | gia huy | huy chương dòng họ | quốc huy","crest | coat of arms","1536120"),
    ("野卑","やひ","adj-na|n","thô tục | thô lỗ | quê kệch | tục tằn | hạ cấp","vulgar | coarse | crude | boorish","1537610"),
    ("矢面","やおもて","n","tuyến đầu | mũi chịu sào | nơi hứng chỉ trích | đương đầu (矢面に立つ)","firing line | position subject to criticism","1537790"),
    ("躍如","やくじょ","adj-t|adv-to","sống động | sinh động | như thật | rõ mồn một","vivid | lifelike | graphic","1538480"),
    ("夜叉","やしゃ","n","dạ xoa | quỷ dạ xoa | thần hộ pháp dữ tợn","yaksha (demonic guardian deity)","1536750"),
    ("野次","やじ","n","la ó | chế giễu | huýt sáo phản đối | giễu cợt","hooting | jeering | heckling","1537390"),
    ("和ぐ","なぐ","v5g|vi","lắng dịu | nguôi ngoai | bình tâm | dịu lại (lòng)","to become calm (of mind) | to calm down","2859999"),
    ("雄叫び","おたけび","n","tiếng thét | tiếng gầm (chiến thắng) | tiếng hô xung trận | thét lớn","roar | battle cry | war cry","1542530"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
