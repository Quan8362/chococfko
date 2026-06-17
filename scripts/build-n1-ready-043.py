# -*- coding: utf-8 -*-
"""Build N1 ready wave 043 — formal/colloquial nouns + 慣用句 (set 43)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-043.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("折檻","せっかん","n|vs|vt","đánh phạt | trừng phạt thể xác | quở mắng nặng | rầy la","physical punishment | severe scolding","1618910"),
    ("世辞","せじ","n","lời tâng bốc | lời xã giao | nịnh nọt | lời khen lấy lòng (お世辞)","flattery | a compliment","1374060"),
    ("銭","ぜに","n","tiền xu | tiền bạc | đồng tiền (銭ゲバ: kẻ hám tiền)","money | a coin","2175880"),
    ("是非もない","ぜひもない","exp","không thể tránh | đành chịu | hết cách | bất khả kháng","unavoidable | inevitable","2118070"),
    ("攻め","せめ","n|suf","sự tấn công | đòn công | thế công | dồn dập (đối lập với 守り)","attack | offense | assault","1279120"),
    ("切羽詰まる","せっぱつまる","v5r|vi","cùng đường | bị dồn vào thế bí | hết cách | bí bách | nước đến chân","to be at one's wits' end | to be cornered","1384970"),
    ("世話焼き","せわやき","n","người hay lo cho người khác | kẻ thích chăm sóc | người lắm chuyện tốt bụng","a helpful (or overly helpful) person","1374330"),
    ("善玉","ぜんだま","n","người tốt | vai thiện | nhân vật chính diện | phe tốt","a good guy | a good person","1394360"),
    ("千秋","せんしゅう","n","ngàn năm | nghìn thu | thời gian dài đằng đẵng (一日千秋)","a thousand years | many years","1388910"),
    ("詮無い","せんない","adj-i","vô ích | đành chịu | không còn cách nào | uổng công","unavoidable | of no use | futile","1824270"),
    ("先達","せんだつ","n","bậc tiền bối | người dẫn đường | người đi trước | tiền nhân | hướng đạo","a pioneer | a senior figure | a guide","1388090"),
    ("前哨戦","ぜんしょうせん","n","trận tiền tiêu | màn dạo đầu | cuộc đụng độ mở màn | trận khởi động","a preliminary skirmish | a prelude","1393250"),
    ("餞別","せんべつ","n","quà chia tay | quà tiễn biệt | tiền tiễn chân","a farewell gift","1574450"),
    ("僧","そう","n","nhà sư | tăng lữ | thầy tu | tăng đoàn","a monk | a priest","1398030"),
    ("相違ない","そういない","adj-i","chắc chắn | không còn nghi ngờ | đúng là | hẳn là","without doubt | certain | sure","2027060"),
    ("雑炊","ぞうすい","n","cháo rau cá | cơm nấu loãng với rau cá nêm tương | cháo thập cẩm","rice gruel with vegetables and fish","1299440"),
    ("草創","そうそう","n|vs","buổi đầu | khởi đầu | thời kỳ sáng lập | sơ khai","the beginning | the inauguration","1660830"),
    ("造作","ぞうさ","n","sự phiền phức | việc khó nhọc | sự tiếp đãi (造作ない: dễ dàng)","trouble | difficulty | hospitality","1403690"),
    ("壮途","そうと","n","sự nghiệp lớn lao | chuyến đi đầy hoài bão | việc trọng đại","an ambitious undertaking","1660870"),
    ("俎上","そじょう","n","trên thớt | bị đem ra mổ xẻ | bị đặt lên bàn cân (俎上に載せる)","on the chopping board | subject to scrutiny","1563340"),
    ("俗物","ぞくぶつ","n","kẻ tầm thường | người thực dụng | kẻ phàm phu tục tử | kẻ trưởng giả","a philistine | a worldly-minded person | a snob","1405600"),
    ("反っ歯","そっぱ","n","răng vẩu | răng hô | răng chìa ra","prominent front teeth | buckteeth","2107360"),
    ("反り","そり","n","độ cong | sự vênh | độ uốn | dáng cong (lưỡi kiếm) (反りが合う)","a warp | a curve | the curvature of a sword","1480110"),
    ("大過","たいか","n","sai lầm nghiêm trọng | lỗi lớn | sai sót tày trời (大過なく: suôn sẻ)","a serious error | a gross mistake","1661010"),
    ("大儀","たいぎ","n|adj-na","đại lễ | nghi lễ trọng đại | việc mệt nhọc | uể oải ngại làm","a state ceremony | troublesome | irksome","1787050"),
    ("退屈しのぎ","たいくつしのぎ","n","giết thời gian | cho đỡ chán | giải khuây | tiêu khiển","killing time | staving off boredom","1779210"),
    ("醍醐","だいご","n","đề hồ (vị tối thượng) | chân lý tối cao của Phật pháp | niết bàn (醍醐味)","ghee (the finest flavour) | the ultimate truth of Buddhism","1734810"),
    ("大悟","たいご","n|vs|vi","đại ngộ | giác ngộ lớn | đại trí tuệ | tỉnh ngộ sâu sắc","great enlightenment | great wisdom","1660990"),
    ("太刀","たち","n","trường kiếm | kiếm dài (đeo bên hông, lưỡi quay xuống)","a long sword | a tachi","1408340"),
    ("太刀打ち","たちうち","n|vs|vi","giao đấu | đọ sức | đối chọi | địch nổi (太刀打ちできない)","crossing swords | contending with","1408350"),
    ("多寡","たか","n","nhiều hay ít | mức độ | số lượng | lớn nhỏ | đa thiểu","quantity | the amount | greatness or smallness","1407500"),
    ("高飛び","たかとび","n|vs|vi","cao chạy xa bay | bỏ trốn đi xa | trốn nã | nhảy cao","fleeing to a distant place | absconding","1808990"),
    ("丈比べ","たけくらべ","n|vs","so chiều cao | đọ vóc dáng | đo cao thấp","comparison of statures","1354620"),
    ("出し","だし","n","nước dùng | nước cốt cá kelp | cái cớ | bị lợi dụng làm bình phong (出しにする)","dashi (soup stock) | a pretext | a dupe","1339160"),
    ("駄々","だだ","n","nũng nịu đòi hỏi | mè nheo | ăn vạ | làm nũng (駄々をこねる)","whining to get one's way | a tantrum","2431160"),
    ("立ち消え","たちぎえ","n","tắt giữa chừng | lụi dần | đổ bể nửa chừng | chìm xuồng | phai nhạt","fizzling out | falling through | dying away","1838180"),
    ("立ち回り","たちまわり","n","màn ẩu đả | cảnh đánh nhau | cách xử sự | sự đi lại chạy vạy","a fight | a scuffle | conducting oneself","1837770"),
    ("店賃","たなちん","n","tiền thuê nhà | tiền thuê cửa hàng","house rent","1804550"),
    ("狸寝入り","たぬきねいり","n|vs|vi","giả vờ ngủ | giả ngủ | vờ ngủ say (như con lửng)","feigning sleep","1834710"),
    ("旅心","たびごころ","n","lòng ham đi | niềm khao khát lữ hành | hứng đi xa","the desire to travel","1839210"),
    ("食べ盛り","たべざかり","n","tuổi ăn tuổi lớn | đang tuổi ăn khỏe | thời kỳ háu ăn (trẻ con)","a growing child's hearty appetite","1839680"),
    ("玉砕","ぎょくさい","n|vs|vi","ngọc nát (chết vinh) | quyết tử không hàng | thua nhưng anh dũng | tỏ tình bị từ chối thẳng","an honorable death | fighting to the last | being utterly rejected","1240580"),
    ("袂","たもと","n","tay áo kimono | túi tay áo | chân (cầu/núi) | lân cận (袂を分かつ)","the sleeve of a kimono | the vicinity (of a bridge)","2078380"),
    ("力負け","ちからまけ","n|vs|vi","thua vì kém sức | bị áp đảo | đuối sức mà thua | gắng quá hóa thua","losing by being overmatched | losing from overexertion","1796050"),
    ("逐一","ちくいち","adv","từng cái một | chi tiết | tỉ mỉ | cặn kẽ | tường tận","one by one | in detail | minutely","1422480"),
    ("血筋","ちすじ","n","huyết thống | dòng dõi | dòng máu | nòi giống","lineage | blood relationship | descent","1255220"),
    ("血の巡り","ちのめぐり","exp|n","tuần hoàn máu | sự nhanh trí | đầu óc lanh lợi (血の巡りが悪い: chậm hiểu)","blood circulation | apprehension","1622810"),
    ("血迷う","ちまよう","v5u|vi","mất trí | hóa điên | mất tự chủ | quẫn trí làm liều","to lose one's mind | to lose control of oneself","1622750"),
    ("茶飲み話","ちゃのみばなし","n","chuyện phiếm bên tách trà | tán gẫu | chuyện vãn | tâm sự vặt","a chat over tea | small talk","1711610"),
    ("茶目","ちゃめ","adj-na|n","tinh nghịch | tươi vui | hay đùa | kẻ nghịch ngợm | mắt nâu","playful | mischievous | a prankster","1422870"),
    ("ちゃらんぽらん","ちゃらんぽらん","adj-na|n","vô trách nhiệm | hời hợt | qua loa | tắc trách | bừa bãi","irresponsible | sloppy | slipshod","2027360"),
    ("注進","ちゅうしん","n|vs|vt","cấp báo | mật báo | báo cáo cấp trên | tâu báo","making a report (to a superior)","1623390"),
    ("弔辞","ちょうじ","n","điếu văn | lời chia buồn | lời viếng | văn tế","a memorial address | a eulogy","1427690"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
