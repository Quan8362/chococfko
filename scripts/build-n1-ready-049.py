# -*- coding: utf-8 -*-
"""Build N1 ready wave 049 — 四字熟語 + literary 漢語 (set 49)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-049.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("事実無根","じじつむこん","n|adj-no","hoàn toàn bịa đặt | không căn cứ | trái hẳn sự thật | vô căn cứ","groundless | entirely contrary to fact","1313990"),
    ("時代錯誤","じだいさくご","n","lỗi thời | lạc hậu | trái với thời đại | lệch thời","anachronism","1316320"),
    ("七難八苦","しちなんはっく","n","thất nạn bát khổ | trăm bề khốn khổ | tai ương dồn dập | hoạn nạn liên miên","a series of disasters | all kinds of hardships","1721450"),
    ("櫛風沐雨","しっぷうもくう","n","dãi gió dầm mưa | trải qua gian khổ | bôn ba vất vả","struggling through wind and rain | enduring hardships","2046310"),
    ("四方八方","しほうはっぽう","n","tứ phương tám hướng | khắp mọi nơi | mọi phía | bốn phương tám hướng","all directions | everywhere | all sides","1307380"),
    ("社交辞令","しゃこうじれい","n","lời xã giao | lời khách sáo | lời nói đãi bôi | lời lịch sự suông","diplomatic language | empty compliment | lip service","1702700"),
    ("周章狼狽","しゅうしょうろうばい","n|vs|vi","cuống cuồng hoảng loạn | luống cuống tay chân | rối rít hoảng hốt","consternation | falling into a panic | dismay","1331140"),
    ("秋霜烈日","しゅうそうれつじつ","n","nghiêm khắc gay gắt | uy nghiêm như sương thu nắng gắt | khắc nghiệt cứng rắn","harshness | severity (like autumn frost and blazing sun)","1734150"),
    ("正真正銘","しょうしんしょうめい","adj-no|n","chính hiệu | thứ thiệt | đích thực | thực thụ | chính cống","genuine | authentic | the real thing","1377430"),
    ("深山幽谷","しんざんゆうこく","n","thâm sơn cùng cốc | rừng sâu núi thẳm | chốn hoang vu hẻo lánh","deep mountain valleys | the remote wilderness","1768970"),
    ("心神耗弱","しんしんこうじゃく","n","suy giảm năng lực hành vi | mất khả năng nhận thức (vì bệnh tâm thần/say)","diminished mental capacity | legally unaccountable","1360730"),
    ("新進気鋭","しんしんきえい","n|adj-no","trẻ trung đầy nhiệt huyết | tài năng trẻ đang lên | mới nổi sung sức","young and energetic | up-and-coming","1361950"),
    ("人心","じんしん","n","lòng người | nhân tâm | tình cảm dân chúng | nhân tình thế thái","the human heart | public feeling","1580680"),
    ("針葉","しんよう","n","lá kim | lá hình kim (針葉樹: cây lá kim)","a needle leaf","2848368"),
    ("深慮","しんりょ","n","suy nghĩ sâu xa | thận trọng cân nhắc | thâm trầm lo xa | mưu sâu","deep thought | prudence | deliberation","1646950"),
    ("頭寒足熱","ずかんそくねつ","n","đầu mát chân ấm | giữ đầu mát chân ấm (bí quyết sức khỏe)","keeping the head cool and the feet warm","1692390"),
    ("前人未到","ぜんじんみとう","adj-no|n","chưa ai từng đạt | tiền vô khoáng hậu | chưa có tiền lệ | chưa ai chạm tới","unprecedented | untrodden","1596290"),
    ("千辛万苦","せんしんばんく","n|vs|vi","trăm cay nghìn đắng | muôn vàn gian khổ | nếm đủ đắng cay","countless hardships","1388940"),
    ("千里眼","せんりがん","n","thiên lý nhãn | mắt nhìn xa ngàn dặm | khả năng thấu thị | tiên tri","clairvoyance | second sight","1389330"),
    ("他力","たりき","n","tha lực | sự giúp đỡ từ bên ngoài | nhờ cậy người khác | cứu độ nhờ đức tin","outside help | salvation by faith","1407430"),
    ("単刀","たんとう","n","một thanh kiếm | đơn thương độc mã | đi thẳng vào vấn đề (単刀直入)","a single sword | being direct","2862523"),
    ("小心翼々","しょうしんよくよく","adj-na|adj-no|adj-t|adv-to","nhút nhát rụt rè | nơm nớp lo sợ | dè dặt thận trọng quá mức","very timid | faint-hearted","1348330"),
    ("沈思","ちんし","n|vs|vt|vi","trầm tư | suy ngẫm sâu | trầm ngâm | nghiền ngẫm","contemplation | meditation","1431710"),
    ("津々","しんしん","adj-t|adv-to","tuôn trào | dào dạt | không ngừng | bất tận (興味津々)","gushing | overflowing | endless","1721100"),
    ("二者","にしゃ","n|adj-no","hai bên | hai người | hai vật | hai phía (二者択一)","two things | two persons","1461930"),
    ("拈華微笑","ねんげみしょう","n","niêm hoa vi tiếu | truyền tâm ấn tâm | tâm truyền tâm | hiểu nhau không lời","heart-to-heart communication beyond words","2033230"),
    ("博覧","はくらん","n","đọc rộng | kiến thức uyên bác | hiểu biết sâu rộng (博覧強記)","extensive reading | wide knowledge","1474740"),
    ("百花","ひゃっか","n","trăm hoa | muôn hoa | đủ loại hoa | bách hoa","all varieties of flowers","1488050"),
    ("百花繚乱","ひゃっかりょうらん","n|adj-t","trăm hoa đua nở | nhân tài nở rộ | rực rỡ muôn màu | tài năng tỏa sáng cùng lúc","a profusion of blooming flowers | many talents emerging at once","1488070"),
    ("百鬼夜行","ひゃっきやぎょう","n","bách quỷ dạ hành | lũ quỷ lộng hành ban đêm | đám gian tà tác oai | hỗn loạn ma quái","a nightly procession of monsters | rampant evil-doing","1583380"),
    ("品行","ひんこう","n","phẩm hạnh | hạnh kiểm | đạo đức | cách cư xử (品行方正)","moral conduct | behaviour | deportment","1626870"),
    ("不撓","ふとう","adj-na|n","kiên cường | bất khuất | không nao núng | bền bỉ (不撓不屈)","unbending | inflexible | indomitable","1495500"),
    ("付和","ふわ","n|vs","a dua | hùa theo mù quáng | nhắm mắt theo người (付和雷同)","blindly following others","1496440"),
    ("明鏡","めいきょう","n","gương sáng | tấm gương trong (明鏡止水: tâm tĩnh như gương)","a polished, clear mirror","1674690"),
    ("面目","めんぼく","n","thể diện | danh dự | uy tín | bộ mặt | sĩ diện (面目を失う)","face | honour | reputation | prestige","1533590"),
    ("門外","もんがい","n","ngoài cổng | ngoài chuyên môn | ngoại đạo (門外漢)","outside a gate | beyond one's expertise","1724690"),
    ("勇猛","ゆうもう","adj-na|n","dũng mãnh | gan dạ | quả cảm | anh dũng | kiêu dũng","daring | brave | valiant | intrepid","1539920"),
    ("優柔","ゆうじゅう","adj-na|n","ưu nhu | thiếu quyết đoán | nhu nhược | do dự (優柔不断)","indecisive | irresolute | weak-willed","1539250"),
    ("要害堅固","ようがいけんご","n|adj-no","thành trì kiên cố | địa thế hiểm yếu vững chắc | phòng thủ bất khả xâm","an impregnable fortress","2033010"),
    ("理路","りろ","n","mạch lập luận | lý lẽ | logic | mạch suy luận (理路整然)","logic | reasoning | the line of argument","1644440"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
