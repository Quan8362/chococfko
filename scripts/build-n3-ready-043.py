# -*- coding: utf-8 -*-
"""Build N3 ready wave 043 — 80 freshly-curated N3 words (verbs/adj/nouns) not in DB.
Readings/pos/ent_seq verified against japanese_raw_jmdict; meaning_vi authored by hand;
meaning_en trimmed to core senses for studyability.
"""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n3-vi-ready-043.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(word, reading, pos, vi, en, sid):
    return ",".join([q(word),q(reading),q(""),q("N3"),q(pos),q(vi),q(en),q(""),q("0"),
        q("jmdict"),q(sid),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])

DATA = [
    ("挑む","いどむ","v5m|vt|vi","thách đấu | thử thách | đương đầu (vấn đề)","to challenge | to contend for | to tackle (a problem)","1428230"),
    ("補う","おぎなう","v5u|vt","bổ sung | bù đắp | bù vào (thiếu hụt)","to supplement | to make up for | to compensate for","1514460"),
    ("脅す","おどす","v5s|vt","đe dọa | uy hiếp | dọa nạt","to threaten | to menace | to frighten","1238070"),
    ("削る","けずる","v5r|vt","gọt | bào | cắt giảm | xóa bỏ","to shave | to sharpen | to cut down | to delete","1298090"),
    ("試みる","こころみる","v1|vt","thử | thử nghiệm | thử sức","to try | to attempt | to have a go at","1312280"),
    ("遮る","さえぎる","v5r|vt","ngắt lời | che chắn | cản trở","to interrupt | to obstruct | to block | to cut off","1323290"),
    ("逆らう","さからう","v5u|vi","chống lại | trái lời | bất tuân","to go against | to oppose | to disobey | to defy","1226990"),
    ("探る","さぐる","v5r|vt","dò dẫm | tìm kiếm | thăm dò","to grope for | to search for | to probe into | to sound out","1418260"),
    ("迫る","せまる","v5r|vi|vt","đến gần | cận kề | ép buộc | thúc giục","to approach | to be imminent | to press (someone) | to urge","1475720"),
    ("蓄える","たくわえる","v1|vt","tích trữ | dành dụm | tích lũy","to store | to save up | to stock up | to accumulate","1596860"),
    ("尽くす","つくす","v5s|vt|vi","dốc hết | tận tâm | phục vụ hết mình","to use up | to exhaust | to devote oneself | to do one's utmost","1370090"),
    ("募る","つのる","v5r|vi|vt","tăng dần | dâng cao | kêu gọi (đóng góp) | chiêu mộ","to grow in intensity | to solicit | to recruit","1514800"),
    ("伴う","ともなう","v5u|vi|vt","đi kèm | kéo theo | đi cùng","to accompany | to go hand in hand with | to be accompanied by","1478370"),
    ("狙う","ねらう","v5u|vt","nhắm vào | nhắm bắn | hướng đến","to aim at | to be after | to set as a goal","1396590"),
    ("臨む","のぞむ","v5m|vi","đối mặt | tham dự | nhìn ra (hướng về)","to face (a situation) | to attend | to look out on","1555560"),
    ("省く","はぶく","v5k|vt","lược bỏ | bỏ qua | tiết kiệm","to omit | to leave out | to eliminate | to save","1351040"),
    ("控える","ひかえる","v1|vt|vi","hạn chế | kiêng | ghi chú lại | chờ sẵn","to refrain | to abstain | to jot down | to be in waiting","1279060"),
    ("含む","ふくむ","v5m|vt","bao gồm | chứa đựng | ngậm | ghi nhớ","to contain | to include | to hold in the mouth | to bear in mind","1216880"),
    ("隔てる","へだてる","v1|vt","ngăn cách | phân chia | làm xa cách","to separate | to isolate | to partition | to estrange","1206360"),
    ("乱れる","みだれる","v1|vi","rối loạn | lộn xộn | bị xáo trộn","to be disordered | to be disheveled | to be disturbed","1548940"),
    ("催す","もよおす","v5s|vt","tổ chức (sự kiện) | cảm thấy (buồn ngủ...) ","to hold (an event) | to feel (a sensation) | to show signs of","1292160"),
    ("養う","やしなう","v5u|vt","nuôi dưỡng | chu cấp | bồi dưỡng (thói quen)","to support | to provide for | to raise | to cultivate (a habit)","1547090"),
    ("譲る","ゆずる","v5r|vt","nhường | chuyển giao | nhượng bộ | bán lại","to hand over | to transfer | to give up (e.g. seat) | to concede","1357030"),
    ("装う","よそおう","v5u|vt","ăn diện | trang trí | giả vờ | ngụy trang","to dress oneself | to adorn | to pretend | to disguise as","1402280"),
    ("詫びる","わびる","v1|vt","xin lỗi | tạ lỗi","to apologize | to make an apology","1606790"),
    ("敬う","うやまう","v5u|vt","kính trọng | tôn kính | tôn sùng","to show respect for | to revere | to honour","1250700"),
    ("承る","うけたまわる","v5r|vt","kính nghe | tiếp nhận (đơn) | xin được (khiêm nhường)","to hear (humbly) | to receive (an order) | to undertake","1349440"),
    ("怠る","おこたる","v5r|vt|vi","lơ là | xao nhãng | bỏ bê","to neglect | to be negligent in | to fail to do","1410710"),
    ("脅かす","おびやかす","v5s|vt","đe dọa | uy hiếp | gây nguy hiểm","to intimidate | to threaten | to endanger","1578075"),
    ("陥る","おちいる","v5r|vi","rơi vào | sa vào (hỗn loạn, bẫy) | thất thủ","to fall into (a hole, chaos, a trap) | to surrender","1216120"),
    ("及ぼす","およぼす","v5s|vt","gây ra | tác động đến | đem lại (ảnh hưởng)","to exert (influence) | to cause (damage) | to bring about","1228180"),
    ("顧みる","かえりみる","v1|vt","nhìn lại | hồi tưởng | quan tâm đến","to look back on | to reflect on | to concern oneself about","1267870"),
    ("輝く","かがやく","v5k|vi","tỏa sáng | lấp lánh | rạng ngời","to shine | to sparkle | to glitter | to light up","1224020"),
    ("構える","かまえる","v1|vt|vi","dựng lên (nhà) | sẵn sàng (tư thế) | làm bộ","to set up (a house) | to stand ready | to put on an air","1279700"),
    ("枯れる","かれる","v1|vi","khô héo | tàn lụi | (cây) chết","to wither | to die (of a plant) | to mature (of character)","1267220"),
    ("競う","きそう","v5u|vi","cạnh tranh | thi đua | đua tranh","to compete | to contend | to vie","1234040"),
    ("朽ちる","くちる","v1|vi","mục nát | mục ruỗng | bị lãng quên","to rot | to decay | to die in obscurity","1229310"),
    ("覆す","くつがえす","v5s|vt","lật đổ | lật úp | đảo ngược (quyết định)","to overturn | to capsize | to overthrow | to reverse","1501490"),
    ("企てる","くわだてる","v1|vt","mưu tính | lập kế hoạch | toan tính","to plan | to plot | to attempt | to undertake","1218120"),
    ("妨げる","さまたげる","v1|vt","cản trở | ngăn cản | gây trở ngại","to disturb | to prevent | to obstruct | to hinder","1519120"),
    ("授ける","さずける","v1|vt","ban cho | trao tặng | truyền dạy","to grant | to confer | to award | to impart (knowledge)","1330280"),
    ("強いる","しいる","v1|vt","ép buộc | cưỡng ép | áp đặt","to force | to compel | to coerce | to impose","1236100"),
    ("沈める","しずめる","v1|vt","nhấn chìm | làm chìm | hạ thấp xuống","to sink | to submerge | to lower","1431680"),
    ("従う","したがう","v5u|vi","tuân theo | làm theo | đi theo","to obey | to abide by | to follow | to conform to","1335210"),
    ("退く","しりぞく","v5k|vi","lùi lại | rút lui | từ chức","to step back | to retreat | to withdraw | to resign","1595084"),
    ("据える","すえる","v1|vt","đặt (cố định) | lắp đặt | bố trí","to place (in position) | to fix | to install | to settle","1373480"),
    ("廃れる","すたれる","v1|vi","lỗi thời | mai một | suy tàn","to become obsolete | to die out | to go out of fashion | to decline","1472020"),
    ("接する","せっする","vs-s|vi|vt","tiếp xúc | giáp ranh | đối đãi | tiếp nhận (tin)","to come in contact with | to border on | to deal with | to receive (news)","1385350"),
    ("攻める","せめる","v1|vt","tấn công | công kích","to attack | to assault | to assail","1279130"),
    ("反らす","そらす","v5s|vt","làm cong | uốn cong | bẻ cong","to bend | to warp | to curve","1480090"),
    ("耐える","たえる","v1|vi|vt","chịu đựng | chống chọi | chịu được","to bear | to endure | to withstand | to resist","1211310"),
    ("漂う","ただよう","v5u|vi","trôi nổi | lững lờ | phảng phất (mùi, không khí)","to drift | to float | to waft | to hang in the air","1489240"),
    ("費やす","ついやす","v5s|vt","tiêu tốn | bỏ ra | lãng phí","to spend | to expend | to consume | to waste","1484600"),
    ("仕える","つかえる","v1|vi","phục vụ | hầu hạ | làm việc cho","to serve | to work for | to attend","1304760"),
    ("償う","つぐなう","v5u|vt","đền bù | bồi thường | chuộc lỗi","to make up for | to compensate for | to atone for","1346020"),
    ("貫く","つらぬく","v5k|vt","xuyên qua | đâm thủng | kiên trì (giữ vững)","to go through | to pierce | to stick to (a principle) | to carry out","1215070"),
    ("照らす","てらす","v5s|vt","chiếu sáng | rọi | đối chiếu","to shine on | to illuminate | to compare with","1350840"),
    ("尊ぶ","とうとぶ","v5b|vt","tôn trọng | coi trọng | kính trọng","to value | to esteem | to respect | to revere","1598640"),
    ("遂げる","とげる","v1|vt","đạt được | hoàn thành | thực hiện","to accomplish | to achieve | to carry out","1372620"),
    ("滞る","とどこおる","v5r|vi","đình trệ | bị chậm trễ | nợ đọng","to stagnate | to be delayed | to be overdue (payment)","1410920"),
    ("嘆く","なげく","v5k|vt|vi","than thở | thương tiếc | đau buồn","to lament | to grieve | to regret | to deplore","1418090"),
    ("怠ける","なまける","v1|vi|vt","lười biếng | trốn việc | lơ là","to be lazy | to be idle | to slack | to neglect","1410660"),
    ("悩ます","なやます","v5s|vt","làm phiền | quấy rầy | dày vò","to afflict | to torment | to harass","1469840"),
    ("覗く","のぞく","v5k|vt|vi","nhìn lén | ngó vào | hé nhìn","to peek | to look into | to sneak a look at","1470840"),
    ("罵る","ののしる","v5r|vt","mắng chửi | nguyền rủa | sỉ vả","to abuse (verbally) | to curse at | to speak ill of","1471520"),
    ("映える","はえる","v1|vi","tỏa sáng | nổi bật | trông đẹp (ăn ảnh)","to shine | to glow | to look attractive | to be set off by","1600620"),
    ("阻む","はばむ","v5m|vt","ngăn chặn | cản trở | ngăn cản","to stop | to prevent | to hinder | to obstruct","1397800"),
    ("阻止","そし","n|vs|vt","sự ngăn chặn | sự cản trở","obstruction | prevention | blocking | stopping","1397820"),
    ("漠然","ばくぜん","adj-t|adv-to","mơ hồ | mập mờ | không rõ ràng","vague | obscure | indistinct | ambiguous","1475790"),
    ("頻繁","ひんぱん","adj-na","thường xuyên | liên tục | dồn dập","frequent | incessant","1491050"),
    ("円滑","えんかつ","adj-na","trơn tru | suôn sẻ | êm thấm","smooth | uninterrupted | harmonious","1576570"),
    ("巧み","たくみ","adj-na|n","khéo léo | tài tình | tinh xảo","skillful | adroit | clever | ingenious","1278290"),
    ("矛盾","むじゅん","n|vs|vi","mâu thuẫn | trái ngược | bất nhất","contradiction | inconsistency","1531090"),
    ("把握","はあく","n|vs|vt","nắm bắt | thấu hiểu | nắm rõ","grasp (of a situation) | understanding | control","1470910"),
    ("該当","がいとう","n|vs|vi","phù hợp | tương ứng | thuộc diện","corresponding to | being applicable to | falling under","1204700"),
    ("譲歩","じょうほ","n|vs|vt|vi","nhượng bộ | thỏa hiệp","concession | conciliation | compromise","1357050"),
    ("是非","ぜひ","adv|n","nhất định | bằng mọi giá | đúng và sai","certainly | without fail | right and wrong | pros and cons","1374530"),
    ("合併","がっぺい","n|vs|vt|vi","sáp nhập | hợp nhất | liên kết","merger | combination | amalgamation | consolidation","1578970"),
    ("怠慢","たいまん","n|adj-na","lơ là | tắc trách | bê trễ","negligence | neglect | carelessness","1410740"),
    ("徹底","てってい","n|vs|vt|vi","triệt để | thấu đáo | thực hiện đến cùng","thoroughness | completeness | thorough enforcement","1437670"),
]

rows=[row(*d) for d in DATA]
content = HEADER + "\n" + "\n".join(rows) + "\n"
with open(OUT,"w",encoding="utf-8",newline="\n") as f:
    f.write(content)
print(f"Written {len(rows)} rows to {os.path.abspath(OUT)}")
