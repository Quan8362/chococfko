# -*- coding: utf-8 -*-
"""Build N1 ready wave 050 — 四字熟語 + literary 漢語 (set 50)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-050.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("明哲","めいてつ","adj-na|n","minh triết | sáng suốt | người hiền minh | bậc trí giả","wisdom | sagacity | a wise man","1641350"),
    ("明哲保身","めいてつほしん","n","minh triết bảo thân | khôn ngoan giữ mình | sáng suốt bảo toàn bản thân","being wise and skilled at self-preservation","2054180"),
    ("妙計","みょうけい","n","diệu kế | mưu hay | kế sách tài tình | sáng kiến tuyệt diệu","an ingenious scheme | a clever plan","1642430"),
    ("無為","むい","adj-na|adj-no|n","vô vi | nhàn rỗi | không làm gì | thụ động (無為自然)","idleness | inactivity","1529620"),
    ("無為徒食","むいとしょく","n|vs","ăn không ngồi rồi | sống vô tích sự | nhàn cư phí thời gian | rảnh rỗi ăn bám","idling one's time away","1529630"),
    ("無我","むが","n","vô ngã | quên mình | xả thân | không chấp ngã (Phật giáo)","selflessness | self-effacement | anatta","1529710"),
    ("無学","むがく","adj-na|adj-no|n","vô học | thất học | dốt nát | mù chữ | thiếu hiểu biết","uneducated | ignorant | illiterate","1529730"),
    ("無欲","むよく","adj-na|adj-no|n","vô dục | không tham | thanh đạm | không vụ lợi | thoát tục","unselfish | free of avarice | disinterested","1530950"),
    ("無理算段","むりさんだん","n|vs|vi","cố xoay xở | chật vật gom góp | vay mượn chạy vạy | gắng gượng lo liệu","scraping together money by straining one's credit","1530990"),
    ("夢幻","むげん","n","mộng ảo | hư ảo | giấc mộng | ảo ảnh | phù du (夢幻泡影)","dreams | fantasy | visions","1529450"),
    ("夢想","むそう","n|vs|vt","mơ mộng | mộng tưởng | ảo tưởng | tơ tưởng | viển vông","a dream | a vision | a reverie","1529480"),
    ("迷夢","めいむ","n","mê muội | ảo tưởng | u mê lầm lạc | giấc mộng mê (迷夢を覚ます)","illusion | delusion | fallacy","1532770"),
    ("名誉挽回","めいよばんかい","n","khôi phục danh dự | lấy lại thanh danh | rửa nhục | gỡ gạc thể diện","restoring one's tarnished reputation","2032780"),
    ("明窓浄机","めいそうじょうき","n","bàn học sạch sẽ bên cửa sáng | không gian học tập lý tưởng | thư phòng yên tĩnh","a clean, well-lit study conducive to learning","2032790"),
    ("妄言","もうげん","n","lời nói càn | lời lẽ thiếu suy nghĩ | nói liều | lời sai trái","a reckless remark | thoughtless words","2848854"),
    ("孟母三遷","もうぼさんせん","exp","Mạnh mẫu ba lần chuyển nhà | tầm quan trọng của môi trường giáo dục con","the importance of a good environment for raising children","2032860"),
    ("門前","もんぜん","n","trước cổng | ngoài cửa | trước cửa nhà (門前払い)","before the gate | in front of the gate","1724720"),
    ("夜郎自大","やろうじだい","n|adj-na","ếch ngồi đáy giếng | tự cao không biết phận | kiêu căng dốt nát","arrogance from ignorance of one's limitations","1537240"),
    ("唯一","ゆいいつ","adj-no|n|adv","duy nhất | độc nhất | có một | duy nhất vô nhị","only | sole | unique","1538920"),
    ("有為","ゆうい","adj-na|adj-no|n","tài năng | có triển vọng | hữu dụng | đầy năng lực | hứa hẹn","capable | able | talented | promising","1541100"),
    ("有形","ゆうけい","n|adj-no","hữu hình | có hình thể | cụ thể | vật chất (có thể thấy được)","material | tangible | concrete","1541220"),
    ("悠長","ゆうちょう","adj-na|n","thong thả | ung dung | chậm rãi | đủng đỉnh | khoan thai","leisurely | slow | easygoing","1540710"),
    ("夕涼み","ゆうすずみ","n|vs|vi","hóng mát chiều hè | ra ngoài hóng gió mát buổi tối | tận hưởng gió mát chiều","enjoying the cool of a summer evening","1542840"),
    ("床しい","ゆかしい","adj-i","tao nhã | đáng mến | thanh lịch | gợi nhớ | khiến người ta tò mò","admirable | charming | refined | nostalgic","1349390"),
    ("湧泉","ゆうせん","n","suối phun | mạch nước trào | suối nguồn tuôn chảy","a bubbling spring | a fountain","2529480"),
    ("夢路","ゆめじ","n","cõi mộng | xứ sở giấc mơ | đường vào giấc mộng (夢路をたどる)","dreamland | the realm of dreams","1773640"),
    ("余韻嫋々","よいんじょうじょう","adj-no|adj-t|adv-to","dư âm vương vấn | âm thanh ngân nga còn vọng | tiếng ngân da diết","sound lingering in the air | trailing notes","1543940"),
    ("余薫","よくん","n","hương thơm còn vương | dư hương | mùi hương phảng phất còn lại","a lingering fragrance","1544070"),
    ("余慶","よけい","n","phúc ấm | ơn để lại cho đời sau | dư phúc | quả lành tổ tiên để lại","blessings bequeathed to posterity | the rewards of virtue","1544080"),
    ("余勢","よせい","n","đà còn lại | thừa thế | khí thế dư | lấy đà (余勢を駆って)","surplus momentum | impetus | inertia","1544330"),
    ("夜業","やぎょう","n|vs|vi","làm đêm | ca đêm | việc ban đêm | làm thêm giờ đêm","night work | a night shift","1536630"),
    ("落花","らっか","n|vs|vi","hoa rơi | cánh hoa rụng | hoa tàn rơi","falling petals","1775600"),
    ("落花流水","らっかりゅうすい","n","hoa rơi nước chảy | tình cảm đôi bên cùng đáp lại | tình yêu được đền đáp","mutual love | love that is returned","2033030"),
    ("乱反射","らんはんしゃ","n|vs|vi","phản xạ khuếch tán | tán xạ ánh sáng | phản chiếu lung tung","diffuse reflection","1821830"),
    ("乱舞","らんぶ","n|vs|vi","múa loạn | nhảy múa cuồng nhiệt | múa tung tóe | nhảy nhót náo loạn","a boisterous dance","1549090"),
    ("力戦","りきせん","n|vs|vi","chiến đấu hết sức | đánh hăng | dốc sức giao tranh","hard fighting | fighting with all one's might","1555080"),
    ("利己","りこ","n","vị kỷ | ích kỷ | tư lợi | vì lợi riêng (利己主義)","self-interest | egoism","1549530"),
    ("立志","りっし","n","lập chí | định hướng cuộc đời | xác định mục tiêu sống (立志伝)","fixing one's aim in life","1644460"),
    ("立身","りっしん","n|vs|vi","lập thân | thành đạt | gây dựng sự nghiệp | thành công trên đời (立身出世)","establishing oneself | success in life","1618650"),
    ("流転","るてん","n|vs|vi","luân hồi | biến chuyển không ngừng | xoay vần | thăng trầm (流転の人生)","continual change | vicissitudes | transmigration","1835160"),
    ("両断","りょうだん","n|vs|vt","chặt đôi | cắt làm hai | phân đôi (一刀両断)","bisection | cutting in two","1553870"),
    ("良風","りょうふう","n","tập tục tốt đẹp | thuần phong | mỹ tục (良風美俗)","good custom","1775260"),
    ("臨戦","りんせん","n","sẵn sàng chiến đấu | chuẩn bị lâm trận | trực chiến (臨戦態勢)","preparing for battle","1815760"),
    ("類型","るいけい","n","loại hình | kiểu mẫu | dạng thức | thể loại | khuôn mẫu chung","a type | a pattern | a genre","1606370"),
    ("冷然","れいぜん","adj-t|adv-to","lạnh lùng | thờ ơ | dửng dưng | lãnh đạm | vô cảm","cold (attitude) | indifferent | aloof","1557090"),
    ("連鎖","れんさ","n|vs|vi","chuỗi | dây chuyền | mắt xích | sự liên kết nối tiếp (連鎖反応)","a chain | a series | a linkage","1559490"),
    ("連戦","れんせん","n|vs|vi","đánh liên tiếp | giao tranh liên tục | thi đấu liền mạch (連戦連勝)","a series of successive battles","1559570"),
    ("和魂","わこん","n","hồn Nhật | tinh thần Nhật Bản | hồn dân tộc (和魂洋才)","the Japanese spirit","2860747"),
    ("猥雑","わいざつ","adj-na|n","thô tục | bừa bộn lộn xộn | nhếch nhác | tạp nham | dung tục","vulgar | crude | jumbled | disorderly","1569330"),
    ("惑乱","わくらん","n|vs|vt|vi","hoang mang | rối trí | bối rối | mê loạn tâm trí","bewilderment | confusion","1662040"),
    ("渡世","とせい","n","mưu sinh | kế sinh nhai | nghề nghiệp | cách sống ở đời | bươn chải","making one's way in the world | a livelihood","1444710"),
    ("割り切る","わりきる","v5r|vt","dứt khoát | rạch ròi | chấp nhận thực tế | suy nghĩ thực dụng | chia hết","to come to a clean decision | to be pragmatic | to divide exactly","1207820"),
    ("椀飯","おうばん","n","mâm cỗ trong bát sơn mài | tiệc mừng (椀飯振る舞い: thết đãi linh đình)","a dish served in a lacquered bowl | a celebratory banquet","2823020"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
