# -*- coding: utf-8 -*-
"""Build N1 ready wave 067 — abstract 3-char compounds (-ron, -kan, -shin, -teki, -ka, -shugi) (set 67)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-067.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("悲観論","ひかんろん","n","chủ nghĩa bi quan | thuyết bi quan | quan điểm bi quan","pessimism","1689120"),
    ("楽観論","らっかんろん","n","chủ nghĩa lạc quan | thuyết lạc quan | quan điểm lạc quan","optimism","1207330"),
    ("宿命論","しゅくめいろん","n","thuyết định mệnh | chủ nghĩa số mệnh | định mệnh luận","fatalism","1734250"),
    ("唯物論","ゆいぶつろん","n","chủ nghĩa duy vật | duy vật luận","materialism","1538990"),
    ("唯心論","ゆいしんろん","n","chủ nghĩa duy tâm | duy tâm luận | thuyết duy tâm","spiritualism | idealism","1538970"),
    ("認識論","にんしきろん","n","nhận thức luận | lý thuyết nhận thức | tri thức luận","epistemology","1729510"),
    ("方法論","ほうほうろん","n","phương pháp luận | hệ phương pháp","methodology","1709930"),
    ("目的論","もくてきろん","n","mục đích luận | thuyết cứu cánh | thuyết mục đích","teleology","1808000"),
    ("運命論","うんめいろん","n","thuyết vận mệnh | chủ nghĩa định mệnh | vận mệnh luận","fatalism","1173040"),
    ("不可知論","ふかちろん","n|adj-no","thuyết bất khả tri | bất khả tri luận","agnosticism","1491500"),
    ("倫理観","りんりかん","n","quan niệm đạo đức | ý thức luân lý | giá trị đạo đức","ethical viewpoint | sense of ethics","2534540"),
    ("強迫観念","きょうはくかんねん","n","ám ảnh | nỗi ám ảnh cưỡng bức | ý nghĩ ám ảnh dai dẳng","obsession | compulsive idea","1799830"),
    ("既成概念","きせいがいねん","n","định kiến | quan niệm có sẵn | khái niệm rập khuôn | thành kiến","a preconceived notion | a stereotype","1932680"),
    ("閉塞感","へいそくかん","n","cảm giác bế tắc | cảm giác ngột ngạt | sự tù túng | nỗi tuyệt vọng","a feeling of entrapment | a sense of hopelessness","2170820"),
    ("背徳感","はいとくかん","n","cảm giác tội lỗi | cảm giác phạm cấm | nỗi day dứt vì làm điều sai","a sense of guilty pleasure","2846400"),
    ("威圧感","いあつかん","n","cảm giác bị áp đảo | vẻ uy hiếp | sự đe nẹt | không khí áp chế","an intimidating air","2414320"),
    ("不快感","ふかいかん","n","cảm giác khó chịu | sự bực bội | nỗi bất bình | sự không thoải mái","discomfort | displeasure","2067850"),
    ("全能感","ぜんのうかん","n","cảm giác toàn năng | ảo tưởng mình làm được mọi thứ | cảm giác vạn năng","a sense of omnipotence","2871205"),
    ("警戒心","けいかいしん","n","sự cảnh giác | tâm lý đề phòng | lòng cảnh giác | sự dè chừng","wariness","1252320"),
    ("功名心","こうみょうしん","n","lòng ham công danh | khát vọng thành danh | chí tiến thủ danh vọng","ambition | aspiration","1275100"),
    ("虚栄心","きょえいしん","n","lòng hư vinh | tính sĩ diện | thói khoe khoang | sự phù phiếm","vanity","1609670"),
    ("忠誠心","ちゅうせいしん","n","lòng trung thành | sự tận trung | lòng trung nghĩa","loyalty | faithfulness","2133400"),
    ("愛国心","あいこくしん","n","lòng yêu nước | tinh thần ái quốc | lòng ái quốc","patriotism","1150740"),
    ("恐怖心","きょうふしん","n","tâm lý sợ hãi | nỗi khiếp sợ | lòng sợ sệt","fear | terror","1676420"),
    ("羞恥心","しゅうちしん","n","lòng tự trọng e thẹn | sự xấu hổ | cảm giác hổ thẹn | tính biết ngượng","a sense of shame | shyness","1570640"),
    ("射幸心","しゃこうしん","n","máu cờ bạc | thói cầu may | lòng ham đầu cơ | tâm lý đỏ đen","a passion for gambling | a speculative spirit","1646370"),
    ("独立心","どくりつしん","n","tinh thần tự lập | tính tự chủ | ý chí độc lập","an independent spirit","1456070"),
    ("公徳心","こうとくしん","n","ý thức công đức | tinh thần vì cộng đồng | đạo đức công cộng","public spirit","1274440"),
    ("利己心","りこしん","n","tính ích kỷ | lòng vị kỷ | sự vụ lợi cá nhân","egoism | selfishness","1758100"),
    ("慈悲心","じひしん","n","lòng từ bi | tâm nhân ái | lòng thương xót | từ tâm","a merciful heart | compassion","1315450"),
    ("道徳的","どうとくてき","adj-na","có đạo đức | mang tính luân lý | thuộc về đạo đức","ethical | moral","1770890"),
    ("刹那的","せつなてき","adj-na","thoáng chốc | phù du | sống cho hiện tại | chỉ biết khoảnh khắc","ephemeral | transitory","1564510"),
    ("扇情的","せんじょうてき","adj-na","khêu gợi | giật gân | kích động | gợi dục | khiêu khích","sensational | inflammatory | suggestive","1614840"),
    ("暴力的","ぼうりょくてき","adj-na","mang tính bạo lực | hung bạo | dùng vũ lực","violent","2763500"),
    ("理知的","りちてき","adj-na","lý trí | sáng suốt | có trí tuệ | thông tuệ | tỉnh táo","intellectual | rational","1795750"),
    ("合目的","ごうもくてき","adj-na","hợp mục đích | phù hợp với mục tiêu | thích hợp | có chủ đích","purposive | appropriate","1683680"),
    ("没個性","ぼつこせい","n","thiếu cá tính | rập khuôn | vô bản sắc | mất cá tính riêng","a lack of individuality","1628270"),
    ("楽天家","らくてんか","n","người lạc quan | kẻ vô tư | người sống thoải mái | tay yêu đời","an optimist | an easy-going person","1207450"),
    ("理論家","りろんか","n","nhà lý luận | người giỏi lý thuyết | lý thuyết gia","a theorist","1795900"),
    ("策略家","さくりゃくか","n","kẻ mưu lược | nhà chiến lược | tay mưu mẹo | kẻ giỏi bày mưu","a tactician | a schemer","2796800"),
    ("読書家","どくしょか","n","người mê đọc sách | mọt sách | người ham đọc","an avid reader | a bookworm","1688400"),
    ("愛妻家","あいさいか","n","người chồng yêu vợ | ông chồng cưng vợ | người đàn ông thương vợ","a devoted husband","1791500"),
    ("恐妻家","きょうさいか","n","người chồng sợ vợ | ông chồng bị vợ quản | đàn ông râu quặp","a hen-pecked husband","1236720"),
    ("能弁家","のうべんか","n","người hùng biện | nhà diễn thuyết | người khéo ăn nói","an orator","1470280"),
    ("美食家","びしょくか","n","người sành ăn | kẻ ăn ngon | nhà ẩm thực sành điệu","an epicure | a gourmet","1724980"),
    ("浪費家","ろうひか","n","kẻ hoang phí | người tiêu xài hoang | tay phung phí | kẻ vung tay quá trán","a spendthrift | a wasteful person","2106460"),
    ("倹約家","けんやくか","n","người tiết kiệm | kẻ tằn tiện | người chi tiêu dè sẻn","a thrifty, frugal person","1256020"),
    ("慈善家","じぜんか","n","nhà từ thiện | người hảo tâm | nhà hảo tâm | người làm việc thiện","a philanthropist | a charitable person","1315370"),
    ("扇動家","せんどうか","n","kẻ kích động | nhà mị dân | tay xúi giục | kẻ gây rối","a demagogue | an agitator","2406090"),
    ("陰謀家","いんぼうか","n","kẻ âm mưu | tay mưu đồ | kẻ chủ mưu | người hay bày trò ám muội","a conspirator | a plotter","1681880"),
    ("享楽主義","きょうらくしゅぎ","n","chủ nghĩa hưởng lạc | chủ nghĩa khoái lạc | hưởng lạc chủ nghĩa","epicureanism | hedonism","1233240"),
    ("博愛主義","はくあいしゅぎ","n","chủ nghĩa bác ái | tư tưởng nhân ái | bác ái chủ nghĩa","philanthropism","1474550"),
    ("利他主義","りたしゅぎ","n","chủ nghĩa vị tha | tư tưởng vì người khác | vị tha chủ nghĩa","altruism","1758190"),
    ("事大主義","じだいしゅぎ","n","chủ nghĩa thờ kẻ mạnh | thói nịnh bợ cường quyền | a dua kẻ thế","worship of the powerful","1314190"),
    ("教条主義","きょうじょうしゅぎ","n","chủ nghĩa giáo điều | tư tưởng giáo điều cứng nhắc | giáo điều chủ nghĩa","dogmatism","1761470"),
    ("形式主義","けいしきしゅぎ","n|adj-no","chủ nghĩa hình thức | thói hình thức | hình thức chủ nghĩa","formalism","1820850"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
