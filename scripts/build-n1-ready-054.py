# -*- coding: utf-8 -*-
"""Build N1 ready wave 054 — literary 漢語 (set 54)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-054.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("山岳","さんがく","n","núi non | dãy núi | vùng núi | sơn nhạc","mountains | a mountain chain","1302780"),
    ("散華","さんげ","n|vs|vi","rải hoa cúng Phật | hy sinh anh dũng | tử trận vẻ vang | tản hoa","scattering flowers (rite) | a glorious death in battle","1618820"),
    ("惨禍","さんか","n","tai họa thảm khốc | thảm họa | thiên tai | tai ương kinh hoàng","a calamity | a disaster | a catastrophe","1303290"),
    ("山系","さんけい","n","hệ thống núi | dãy núi | sơn hệ","a mountain range | a mountain system","1658010"),
    ("惨状","さんじょう","n","cảnh tượng thảm khốc | quang cảnh kinh hoàng | thảm cảnh","a disastrous scene | a terrible spectacle","1303350"),
    ("散逸","さんいつ","n|vs|vi","thất lạc tản mát | tản mạn rồi mất | phân tán thất tán","being scattered and lost | dissipation","1754680"),
    ("斬新奇抜","ざんしんきばつ","n","mới mẻ độc đáo | tân kỳ phá cách | táo bạo khác lạ | đột phá","novel | unconventional | cutting-edge","1814980"),
    ("散村","さんそん","n","làng thưa thớt | xóm nhà rải rác | thôn xóm phân tán","a dispersed rural settlement","2632270"),
    ("三拝","さんぱい","n|vs|vi","ba lạy | bái lạy nhiều lần | cúi lạy ba lượt (三拝九拝)","worshipping three times | bowing repeatedly","1301400"),
    ("散文的","さんぶんてき","adj-na","như văn xuôi | tản mạn khô khan | thiếu chất thơ | nôm na","prosaic","1754600"),
    ("三位","さんみ","n","ngôi thứ ba | tam phẩm | Ba Ngôi (Chúa) (三位一体)","third rank | the Trinity","1579360"),
    ("山林","さんりん","n","rừng núi | núi rừng | đất rừng | lâm sơn","mountain forest | woodland","1303230"),
    ("死活","しかつ","n|adj-no","sống chết | sinh tử | tử sinh (死活問題: vấn đề sống còn)","life and death","1310770"),
    ("至極","しごく","adv|adj-na|n","vô cùng | hết sức | tột bậc | cực kỳ | thượng hạng","very | extremely | exceedingly | the best","1311920"),
    ("刺殺","しさつ","n|vs|vt","đâm chết | giết bằng dao | đâm thấu tử vong","stabbing to death","1306520"),
    ("四散","しさん","n|vs|vi","tán loạn | phân tán khắp nơi | tản mác bốn phương | rã đám","scattering in all directions","1619090"),
    ("死生","しせい","n","sống chết | sinh tử | tử sinh (死生観)","life and death","1767390"),
    ("死生観","しせいかん","n","quan niệm sống chết | nhân sinh quan về sự sống và cái chết","one's view of life and death","1767400"),
    ("死蔵","しぞう","n|vs|vt","cất giữ không dùng | để xó | tích trữ vô ích | giữ khư khư bỏ phí","hoarding | storing away without using","1310910"),
    ("舌打ち","したうち","n|vs|vi","tặc lưỡi | chép miệng (khó chịu) | chậc lưỡi tỏ ý bực","clicking one's tongue | tut-tut","1387070"),
    ("失地","しっち","n","đất mất | lãnh thổ bị mất | vùng đất đánh mất (失地回復)","lost territory","1320060"),
    ("雌伏","しふく","n|vs|vi","náu mình chờ thời | ẩn nhẫn đợi cơ hội | tạm thời khuất phục rồi vùng lên","biding one's time | lying low awaiting a chance","1312930"),
    ("自負心","じふしん","n","lòng tự tôn | niềm tự hào | sự tự tin | tính tự phụ","pride | self-confidence | self-esteem","1726270"),
    ("死命","しめい","n","mệnh sống chết | sinh tử tồn vong | yết hầu sinh tử (死命を制する)","fate | life or death","1767520"),
    ("霜枯れ","しもがれ","n","héo úa vì sương giá | cây cỏ tàn úa mùa đông | tiêu điều","being nipped by frost | bleak","1749420"),
    ("四面","しめん","n","bốn mặt | bốn phía | tứ bề | xung quanh (四面楚歌)","four sides | all sides","1767230"),
    ("社稷","しゃしょく","n","xã tắc | đất nước | giang sơn | thần đất thần lúa","the state | the nation | tutelary deities","1881670"),
    ("弱卒","じゃくそつ","n","lính hèn nhát | binh sĩ yếu kém | quân nhút nhát (勇将の下に弱卒なし)","a cowardly soldier","1324810"),
    ("社運","しゃうん","n","vận mệnh công ty | tiền đồ doanh nghiệp | tương lai công ty (社運を賭ける)","a company's fortunes","1646420"),
    ("邪宗","じゃしゅう","n","tà giáo | tà đạo | đạo nguy hiểm | dị giáo","heresy | a dangerous religion","1323470"),
    ("弱小","じゃくしょう","adj-na|n","nhỏ yếu | non yếu | kém cỏi nhỏ bé | yếu thế","weak and small | minor | inferior","1595290"),
    ("酋長","しゅうちょう","n","tù trưởng | thủ lĩnh bộ lạc | tộc trưởng","a chieftain","1853880"),
    ("祝着","しゅうちゃく","n","chúc mừng | mừng rỡ | vui mừng khôn xiết (祝着至極)","congratulations","2855309"),
    ("拾得","しゅうとく","n|vs|vt","nhặt được | tìm thấy (đồ rơi) | lượm được (拾得物)","finding (lost property) | picking up","1332580"),
    ("熟柿","じゅくし","n","quả hồng chín | hồng chín mềm | (熟柿主義: chờ thời cơ chín muồi)","a ripe persimmon","1655580"),
    ("出処進退","しゅっしょしんたい","n","tiến lui xuất xử | việc đi hay ở | cách hành xử | quyết định tiến thoái","one's course of action | whether to stay or resign","1594860"),
    ("出色","しゅっしょく","adj-no|adj-na|n","xuất sắc | nổi bật | ưu tú | vượt trội","outstanding | excellent | remarkable","1339250"),
    ("出帆","しゅっぱん","n|vs|vi","nhổ neo | ra khơi | khởi hành (tàu) | dong buồm","setting sail | departure (from port)","1340020"),
    ("順応性","じゅんのうせい","n","tính thích nghi | khả năng thích ứng | sự linh hoạt | tính uyển chuyển","adaptability | flexibility","1736590"),
    ("書院","しょいん","n","thư phòng | phòng đọc sách | thư viện | nhà xuất bản (tên gọi cổ)","a study | a drawing room | a publishing house","1343960"),
    ("小康","しょうこう","n","tạm lắng | tạm ổn | thuyên giảm (bệnh) | yên ắng tạm thời (小康状態)","a lull | a respite | remission (of illness)","1348080"),
    ("峭刻","しょうこく","adj-t|adv-to","khắc nghiệt | nghiêm khắc | hà khắc | tàn nhẫn","very rigorous | strict | cruel","2561990"),
    ("照査","しょうさ","n|vs","đối chiếu kiểm tra | rà soát so sánh | kiểm chứng | xác minh","checking against | verification","1619230"),
    ("鐘声","しょうせい","n","tiếng chuông | âm thanh chuông ngân | tiếng chuông vọng","the sound of a bell","1686750"),
    ("焼夷","しょうい","n","thiêu đốt | đốt cháy rụi | hỏa công (焼夷弾: bom cháy)","burning down | incendiary","2831902"),
    ("情趣","じょうしゅ","n","tình thú | nét nên thơ | dư vị nghệ thuật | cảm hứng tao nhã","mood | sentiment | artistic effect","1356300"),
    ("冗漫","じょうまん","adj-na|n","dài dòng | rườm rà | lan man | lê thê dông dài","verbose | long-winded","1355650"),
    ("肖像","しょうぞう","n","chân dung | bức họa người | tượng chân dung | hình ảnh người","a portrait | a likeness","1351460"),
    ("焦慮","しょうりょ","n|vs|vi","sốt ruột | nóng lòng | bồn chồn lo lắng | bứt rứt sốt sắng","impatience | anxiety","1350830"),
    ("詳報","しょうほう","n|vs|vt","báo cáo chi tiết | tin tường thuật đầy đủ | bản tin chi tiết","a detailed report | full particulars","1351810"),
    ("焦眉","しょうび","n","cấp bách | nguy cấp trước mắt | cháy lông mày | việc khẩn (焦眉の急)","urgency | imminence","1656690"),
    ("逍遥","しょうよう","n|vs|vi","tiêu dao | dạo bước thong thả | ngao du tự tại | nhàn du","a ramble | a saunter | a leisurely stroll","1573630"),
    ("書架","しょか","n","giá sách | kệ sách | tủ sách","a bookshelf | a bookcase","1343970"),
    ("処断","しょだん","n|vs","xử đoán | phán quyết | thi hành án | quyết đoán xử lý","judgement | carrying out a sentence","1718730"),
    ("所信","しょしん","n","niềm tin | xác tín | chính kiến | quan điểm (所信表明)","one's belief | conviction | opinion","1343280"),
    ("庶務","しょむ","n","việc hành chính chung | công việc tổng vụ | sự vụ tổng hợp","general affairs","1343590"),
    ("心眼","しんがん","n","con mắt tâm hồn | nhãn quan nội tâm | tuệ nhãn | mắt thấu tâm (心眼を開く)","the mind's eye","1793650"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
