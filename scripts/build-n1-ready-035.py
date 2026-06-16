# -*- coding: utf-8 -*-
"""Build N1 ready wave 035 — 慣用句 + 四字熟語 + 諺 (set 35)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-035.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("汚名返上","おめいへんじょう","n|vs|vi","rửa sạch tiếng xấu | gột rửa danh dự | phục hồi thanh danh","clearing one's name | redeeming oneself","2042470"),
    ("尾を引く","おをひく","exp|v5k","để lại dư âm | còn dây dưa | ảnh hưởng kéo dài | vương vấn","to have a lasting effect | to leave traces","1485780"),
    ("恩着せがましい","おんきせがましい","adj-i","ra vẻ ban ơn | kể công | làm như ban ơn | trịch thượng","patronizing | acting like one is doing a favor","2056100"),
    ("飼い殺し","かいごろし","n","nuôi báo cô | giữ người mà không trọng dụng | nuôi không cho làm","keeping someone on payroll without using their skills","1839860"),
    ("書き入れ時","かきいれどき","n","thời điểm hốt bạc | mùa làm ăn | lúc đắt khách nhất | mùa cao điểm","busiest and most profitable period | peak season","1589910"),
    ("影武者","かげむしゃ","n","người đóng thế | kẻ giật dây | người sau hậu trường | bóng ma quyền lực","body double | wire puller | person behind the scenes","1590170"),
    ("駆け引き","かけひき","n|vs|vi","mặc cả | đấu trí | sách lược | chiến thuật co kéo | mưu mẹo","bargaining | tactics | maneuvering","1590130"),
    ("重ね重ね","かさねがさね","adv|adj-no","nhiều lần | lặp đi lặp lại | hết lần này đến lần khác | vô cùng","repeatedly | time and again | exceedingly","1335880"),
    ("風上にも置けない","かざかみにもおけない","exp","nỗi nhục cho cả nhóm | làm xấu mặt đồng loại | đồ bỏ đi | đáng khinh","a disgrace (to a whole group)","2122070"),
    ("舵取り","かじとり","n|vs|vt","cầm lái | người lèo lái | chèo lái | dẫn dắt | lãnh đạo","steering | helmsman | guidance | leadership","1753450"),
    ("角が取れる","かどがとれる","exp|v1","trở nên ôn hòa | bớt gai góc | chín chắn dịu dàng hơn | điềm đạm theo tuổi","to mellow | to become softened by maturity","2742550"),
    ("金看板","きんかんばん","n","biển hiệu vàng | chiêu bài | khẩu hiệu | điểm nhấn nổi bật | con át chủ bài","slogan | main feature | star | signboard with gold lettering","1682240"),
    ("壁に耳あり","かべにみみあり","exp","tai vách mạch rừng | tường có tai | cẩn thận kẻo lộ chuyện","walls have ears","2141350"),
    ("仮面をかぶる","かめんをかぶる","exp|v5r","đeo mặt nạ | che giấu bản chất | giả dối | ngụy trang ý đồ","to wear a mask | to hide one's true intentions","2102980"),
    ("画竜点睛を欠く","がりょうてんせいをかく","exp|v5k","thiếu nét chấm phá cuối | dở dang phần cốt yếu | chưa trọn vẹn","to lack the finishing touch | to be incomplete","2852003"),
    ("閑古鳥","かんこどり","n","chim cu cu | sự ế ẩm vắng vẻ (閑古鳥が鳴く: ế khách)","cuckoo (symbol of a deserted, quiet place)","1757650"),
    ("旱天慈雨","かんてんじう","n","mưa rào giữa hạn | cơn mưa cứu hạn | sự cứu giúp đúng lúc","welcome rain in a drought | a welcome relief","2033250"),
    ("気が多い","きがおおい","exp|adj-i","cả thèm chóng chán | đứng núi này trông núi nọ | đa tình | dễ thay lòng","fickle | capricious | having many interests","2079010"),
    ("気が短い","きがみじかい","exp|adj-i","nóng tính | thiếu kiên nhẫn | dễ cáu | nóng nảy","quick-tempered | impatient","1221620"),
    ("聞き捨てならない","ききずてならない","exp","không thể bỏ qua | nghe mà không thể làm ngơ | không thể không lên tiếng","inexcusable | can't be allowed to pass without comment","1823430"),
    ("気骨が折れる","きぼねがおれる","exp|v1","mệt mỏi tinh thần | căng thẳng đầu óc | nhọc tâm lo lắng","to become mentally exhausted | to be worn out by worry","2834577"),
    ("気は心","きはこころ","exp","quà ít lòng nhiều | của ít lòng nhiều | quan trọng là tấm lòng","it's the thought that counts","2141360"),
    ("肝が据わる","きもがすわる","exp|v5r","gan dạ | bản lĩnh | vững vàng | thần kinh thép | điềm tĩnh","to have guts | to have nerves of steel","2703580"),
    ("肝胆相照らす","かんたんあいてらす","exp|v5s","tâm đầu ý hợp | tri kỷ | thân thiết hết lòng | gan ruột sẻ chia","to be inseparable | to be profoundly compatible","1848580"),
    ("急転直下","きゅうてんちょっか","n|vs|vi","đột ngột chuyển biến | xoay chuyển bất ngờ | rẽ ngoặt đột ngột","taking a sudden turn | suddenly and precipitately","1228910"),
    ("琴線に触れる","きんせんにふれる","exp|v1","chạm vào sợi tơ lòng | lay động tâm hồn | gây xúc động sâu xa | đồng cảm","to strike a chord | to tug at one's heartstrings","2836614"),
    ("食い下がる","くいさがる","v5r|vi","bám riết | đeo bám | không chịu lùi | dai dẳng theo đuổi | quyết không buông","to hang on to | to persist | to refuse to back down","1609690"),
    ("草の根","くさのね","exp|n","gốc rễ quần chúng | cơ sở | tầng lớp bình dân | nơi khuất tầm mắt","grassroots | rank and file","1401920"),
    ("首ったけ","くびったけ","adj-na|n","mê mệt | say đắm | yêu điên cuồng | si mê đến tận cổ","madly in love with | head over heels","1329200"),
    ("口裏を合わせる","くちうらをあわせる","exp|v1","thông cung | dàn xếp lời khai | thống nhất câu chuyện | khớp lời","to get the stories straight | to agree on a story beforehand","2122880"),
    ("口がうまい","くちがうまい","exp|adj-i","khéo mồm | dẻo miệng | ngọt nhạt | nói khéo dụ dỗ","glib | honeymouthed | smooth-talking","1608590"),
    ("口を酸っぱくする","くちをすっぱくする","exp|vs-i","dặn đi dặn lại | nói đến mòn cả miệng | nhắc nhở liên tục","to repeatedly admonish | to tell over and over","2839274"),
    ("苦虫","にがむし","n","con bọ đắng (苦虫を噛み潰したよう: mặt nhăn nhó khó chịu)","a bitter-tasting bug","1685030"),
    ("雲をつかむ","くもをつかむ","exp|v5m","mơ hồ | mông lung | nắm bắt mơ hồ | viển vông không rõ ràng","to not have a clear picture | grasping at clouds","2866714"),
    ("軍配","ぐんばい","n|vs","quạt trọng tài (sumo) | quyết định thắng thua | mưu lược (軍配が上がる)","referee's fan | stratagem | tactics","1248840"),
    ("怪我の功名","けがのこうみょう","exp|n","trong cái rủi có cái may | thất bại hóa may | họa lại thành phúc | ăn may","a lucky break | a fortunate error","1976500"),
    ("形勢逆転","けいせいぎゃくてん","n|vs","lật ngược thế cờ | xoay chuyển tình thế | cục diện đảo ngược","the situation reverses | the tables are turned","2044450"),
    ("下馬評","げばひょう","n","lời đồn đại | dư luận | bàn tán | tin vỉa hè | đồn thổi","rumor | gossip | speculation | hearsay","1186130"),
    ("甲乙つけがたい","こうおつつけがたい","exp|adj-i","khó phân cao thấp | một chín một mười | ngang tài ngang sức","hard to tell which is better | little to choose between","2124490"),
    ("好事魔多し","こうじまおおし","exp","việc tốt lắm trắc trở | phúc bất trùng lai | niềm vui hay đi kèm rắc rối","good things are often hindered | lights are followed by shadows","1277650"),
    ("弘法筆を選ばず","こうぼうふでをえらばず","exp","thợ giỏi không chê đồ nghề | người tài không đổ lỗi công cụ","a good workman does not blame his tools","2573160"),
    ("孤立無援","こりつむえん","adj-no","đơn độc không cứu viện | cô lập không người giúp | trơ trọi một mình","isolated and helpless | alone and unassisted","2030770"),
    ("コロンブスの卵","コロンブスのたまご","exp|n","quả trứng Columbus | ý tưởng tưởng khó hóa dễ | tưởng đơn giản mà không nghĩ ra","Columbus' egg | a seemingly simple idea that's hard to think of first","1051790"),
    ("言語に絶する","げんごにぜっする","exp|vs-s","không lời nào tả xiết | vượt khỏi mọi ngôn từ | khôn tả","to be beyond words | to defy description","2124440"),
    ("紺屋の白袴","こうやのしろばかま","exp","thợ nhuộm mặc quần trắng | bụt chùa nhà không thiêng | chuyên gia lại không lo cho mình","the shoemaker's children go barefoot","2093280"),
    ("歳月人を待たず","さいげつひとをまたず","exp","thời gian không chờ đợi ai | năm tháng trôi không đợi người","time waits for no man","2148460"),
    ("策士策に溺れる","さくしさくにおぼれる","exp|v1","khôn quá hóa dại | kẻ mưu mô chết vì mưu | gậy ông đập lưng ông","the schemer drowns in his own scheme","2417550"),
    ("猿芝居","さるしばい","n","trò hề vụng về | diễn xuất lố bịch | màn kịch lộ liễu | mưu đồ vụng","clumsy subterfuge | bad acting | farce","1177450"),
    ("三拍子","さんびょうし","n","nhịp ba | hội đủ ba yếu tố | toàn diện (三拍子そろう)","triple time | three important requisites","1301430"),
    ("舌の根","したのね","exp|n","cuống lưỡi | gốc lưỡi (舌の根も乾かぬうちに: vừa nói xong đã)","base of the tongue","2826617"),
    ("しっぺ返し","しっぺがえし","n|vs|vi","ăn miếng trả miếng | trả đũa | báo thù tức thì | đáp trả","returning tit for tat | retaliation","1696640"),
    ("重箱の隅","じゅうばこのすみ","exp|n","chuyện vụn vặt | tiểu tiết (重箱の隅をつつく: bới lông tìm vết)","trivial things | insignificant details","2859275"),
    ("人後に落ちない","じんごにおちない","exp","không thua kém ai | đứng đầu | không nhường ai | hơn người","to be second to none","2403940"),
    ("死人に口なし","しにんにくちなし","exp","người chết không biết nói | chết là hết đối chứng | đổ cho người chết","dead men tell no tales","2141480"),
    ("死屍累々","ししるいるい","adj-no|adj-t|adv-to","thây chất thành đống | xác la liệt | thi thể ngổn ngang","heaps of corpses all around","2031080"),
    ("酸いも甘いも噛み分ける","すいもあまいもかみわける","exp|v1","nếm đủ mùi đời | từng trải | dày dạn kinh nghiệm | hiểu sự đời","to be experienced in the ways of the world","2096120"),
    ("水魚の交わり","すいぎょのまじわり","exp|n","tình thân như cá với nước | tri kỷ keo sơn | gắn bó khăng khít","an inseparable friendship","2208280"),
    ("住めば都","すめばみやこ","exp","ở đâu quen đó | đất lành chim đậu | nơi nào sống lâu cũng thành quê","you can get used to living anywhere | home is where you make it","1334050"),
    ("青天の霹靂","せいてんのへきれき","exp|n","sét đánh giữa trời quang | tin sét đánh | bất ngờ choáng váng","a bolt out of the blue","1381650"),
    ("背水の陣","はいすいのじん","exp|n","trận chiến quyết tử | đặt mình vào đường cùng | phá đường lui | chiến đến cùng","fighting with one's back to the wall | a last stand","2015160"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
