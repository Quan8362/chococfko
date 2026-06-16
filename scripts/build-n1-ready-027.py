# -*- coding: utf-8 -*-
"""Build N1 ready wave 027 — literary/formal Sino-Japanese nouns (set 27)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-027.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("御託","ごたく","n","lời lảm nhảm | nói dài dòng | ăn nói xấc xược | khoe khoang (御託を並べる)","tedious talk | impertinent talk | pretentious statement","1270500"),
    ("小手先","こてさき","n|adj-no","đầu ngón tay | tiểu xảo | mánh vặt | hời hợt | đối phó tạm bợ","tip of the hand | cheap trick | superficial | makeshift","1743470"),
    ("言伝","ことづて","n","lời nhắn | tin nhắn miệng | lời đồn | nghe đồn","oral message | hearsay | rumour","1264510"),
    ("鼓腹","こふく","n|vs","no đủ | sung sướng | an nhàn thỏa mãn | thái bình thịnh trị","happiness | contentment","1268040"),
    ("御幣","ごへい","n","gậy lễ có dải giấy gấp (Thần đạo) | ngự tệ","staff with plaited paper streamers (Shinto)","1270620"),
    ("財貨","ざいか","n","tài hóa | của cải | tài sản | hàng hóa","commodity | property","1296780"),
    ("最期","さいご","n|adv","phút lâm chung | giây phút cuối đời | cái chết | hồi kết","one's last moment | one's death | one's end","1293760"),
    ("祭壇","さいだん","n","bàn thờ | đàn tế | bệ thờ","altar","1295290"),
    ("沙汰","さた","n|vs|vt","tin tức | thông báo | phán quyết | xử lý | chỉ thị (音沙汰)","affair | matter | verdict | news | instructions","1291480"),
    ("刷新","さっしん","n|vs|vt","cải tổ | đổi mới | canh tân | cải cách","reform | renovation","1298680"),
    ("惨苦","さんく","n","nỗi đau khủng khiếp | thống khổ tột cùng | gian truân cực độ","terrible pain | terrible suffering","2588380"),
    ("産声","うぶごえ","n","tiếng khóc chào đời | tiếng oa oa (産声を上げる: ra đời)","first cry of a newborn baby","1661940"),
    ("山積","さんせき","n|vs|vi","chất đống | tồn đọng chồng chất | ngổn ngang | chất như núi","piling up | accumulating | lying in piles","1609830"),
    ("讒謗","ざんぼう","n|vs|vt","vu khống | phỉ báng | bôi nhọ | gièm pha","libel | slander | defamation","1573020"),
    ("死屍","しし","n","thây ma | tử thi | xác chết","corpse","1767630"),
    ("獅子奮迅","ししふんじん","adj-no|n","dũng mãnh như sư tử | xông xáo mãnh liệt | quyết liệt phi thường","furious energy | frenzied | ferocious","1311100"),
    ("舌鼓","したつづみ","n","tặc lưỡi khen ngon | chép miệng thỏa mãn (món ăn)","smacking one's lips (over food)","1788120"),
    ("辞表","じひょう","n","đơn từ chức | đơn xin nghỉ việc | thư từ nhiệm","letter of resignation","1319010"),
    ("慈母","じぼ","n","từ mẫu | người mẹ hiền | mẹ nhân từ","affectionate mother","1315470"),
    ("邪気","じゃき","n","tà khí | ác ý | khí độc | chướng khí","malice | ill will | noxious vapour","1692890"),
    ("若輩","じゃくはい","n|adj-na","kẻ trẻ tuổi | người non nớt | lính mới | kẻ thiếu kinh nghiệm","young person | greenhorn | novice","1595310"),
    ("驟雨","しゅうう","n","mưa rào | cơn mưa bất chợt | trận mưa xối xả","sudden shower | sudden downpour","1574630"),
    ("醜悪","しゅうあく","adj-na|n","xấu xa | gớm ghiếc | đê hèn | đáng tởm","ugly | hideous | repulsive | disgraceful","1333820"),
    ("祝言","しゅうげん","n","lễ mừng | hôn lễ | tiệc cưới | lễ thành hôn","festivities | celebration | wedding ceremony","1660550"),
    ("衆生","しゅじょう","n","chúng sinh | muôn loài | nhân gian | vạn vật","all living things | mankind","1333290"),
    ("出師","すいし","n","xuất quân | điều binh | xuất chinh","dispatch of troops | expedition","1339070"),
    ("峻拒","しゅんきょ","n|vs|vt","cự tuyệt thẳng thừng | từ chối dứt khoát | khước từ nghiêm khắc","refusing flatly | rejecting sternly","1619320"),
    ("遵奉","じゅんぽう","n|vs|vt","tuân thủ | tuân theo | chấp hành | tuân phụng","obeying | observing | following","1342190"),
    ("妖艶","ようえん","adj-na|n","yêu kiều | quyến rũ mê hoặc | lả lơi gợi cảm | kiều diễm","fascinating | voluptuous | bewitching","1616390"),
    ("笑覧","しょうらん","n|vs|vt","ngài đọc cho (khiêm nhường) | xin được phê duyệt | kính mong xem qua","(your) reading of my work","1660400"),
    ("精霊","しょうりょう","n","vong linh | linh hồn người chết | hương linh","spirit of the deceased","1751450"),
    ("処世","しょせい","n","cách xử thế | lối sống ở đời | đối nhân xử thế","making one's way through life | conduct of life","1718680"),
    ("書簡","しょかん","n","thư từ | thư tín | thư | thư từ qua lại","letter | epistle | correspondence","1343980"),
    ("助長","じょちょう","n|vs|vt","cổ xúy | tiếp tay | thúc đẩy | giúp (vô tình gây hại)","promotion | fostering | unwanted help","1344740"),
    ("思料","しりょう","n|vs|vt","cân nhắc kỹ | suy xét | trầm tư | nghĩ ngợi","careful consideration | thought","1614920"),
    ("垂範","すいはん","n|vs|vi","làm gương | nêu gương | làm mẫu mực","setting an example","1371020"),
    ("推服","すいふく","n|vs|vi","khâm phục | kính phục | thán phục","admiration","1712970"),
    ("枢機","すうき","n","then chốt | điểm cốt yếu | việc trọng đại quốc gia | cơ mật","important point | vital point | state matters","1373340"),
    ("寸志","すんし","n","món quà nhỏ | chút tấm lòng | lễ mọn | quà mọn","small present | small token of appreciation","1373730"),
    ("寸描","すんびょう","n","phác họa ngắn | ký họa sơ lược | mô tả vắn tắt","thumbnail sketch | brief sketch","1653770"),
    ("切歯扼腕","せっしやくわん","n|vs|vi","nghiến răng siết tay | căm phẫn tột độ | uất ức nghẹn ngào","being enraged | gnashing teeth in anger or regret","1385040"),
    ("善導","ぜんどう","n|vs|vt","dẫn dắt đúng đắn | hướng thiện | giáo hóa | chỉ lối","proper guidance","1394510"),
    ("先途","せんど","n","thời khắc quyết định | bước ngoặt | tương lai | đường phía trước","critical moment | decisive point | future","1388240"),
    ("善哉","ぜんざい","int|n","hay lắm! | tốt lắm! | chè đậu đỏ (món ngọt)","well done! | bravo! | red bean soup","1394400"),
    ("詮議","せんぎ","n|vs|vt","bàn bạc | thẩm vấn | tra xét | điều tra (nghi phạm)","deliberation | investigation | questioning","1824280"),
    ("全幅","ぜんぷく","adj-no|n","trọn vẹn | toàn bộ | hết mức | hoàn toàn (全幅の信頼)","full | wholehearted | utmost","1396160"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
