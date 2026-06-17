# -*- coding: utf-8 -*-
"""Build N1 ready wave 074 — compound nouns (-ba, -giwa, -guchi, foundation) (set 74)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-074.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("稽古場","けいこば","n","phòng tập | sàn tập | võ đường | nơi luyện tập","a training hall | a practice room","1933870"),
    ("仕事場","しごとば","n","nơi làm việc | công trường | chỗ làm | xưởng làm","a workplace | a worksite","1304990"),
    ("逃げ場","にげば","n","đường thoát | chỗ trốn | lối thoát | nơi ẩn náu | đường lui","a refuge | an escape | a way out","1808430"),
    ("土俵際","どひょうぎわ","n","mép sới sumo | bờ vực | khoảnh khắc quyết định | phút chót gay cấn","the edge of the ring | the brink | the last moment","1702300"),
    ("水際","みずぎわ","n","mép nước | bờ nước | sát bờ | tại biên giới (trước khi nhập cảnh)","the water's edge | the border","1371490"),
    ("生え際","はえぎわ","n","chân tóc | đường viền tóc | mép tóc | ngấn tóc","the hairline","1625470"),
    ("帰り際","かえりぎわ","n","lúc ra về | khi sắp về | ngay lúc đi về | thời điểm cáo từ","just as one is leaving | the point of departure","2809450"),
    ("別れ際","わかれぎわ","n|adj-no|adv","lúc chia tay | khoảnh khắc từ biệt | khi tạm biệt | giây phút ly biệt","at the moment of parting","2622680"),
    ("死に際","しにぎわ","n","lúc lâm chung | phút cuối đời | giây phút hấp hối | trên giường bệnh cuối","one's last moments | the point of death","1767770"),
    ("寝際","ねぎわ","n","lúc sắp ngủ | khi vừa chợp mắt | trước khi ngủ | lúc thiu thiu","on the verge of sleep","1792990"),
    ("出際","でぎわ","n","lúc sắp đi | thời điểm khởi hành | khi vừa định ra ngoài","the time of setting out","1338960"),
    ("裏口","うらぐち","n|adj-no","cửa sau | lối sau | cửa hậu | đi cửa sau (gian lận) | bất chính","a backdoor | a rear entrance | illicit","1550270"),
    ("表口","おもてぐち","n","cửa trước | lối chính | cổng chính | cửa mặt tiền","the front door","1489530"),
    ("通用口","つうようぐち","n","cửa phụ | lối đi riêng | cửa dành cho nhân viên | cửa hông","a side entrance | a service entrance","2250400"),
    ("登り口","のぼりぐち","n","điểm khởi đầu leo (núi/cầu thang) | chân núi | điểm bắt đầu trèo","the starting point of an ascent","1352530"),
    ("切り口","きりくち","n","mặt cắt | chỗ cắt | góc nhìn | cách tiếp cận mới | lát cắt vấn đề","a cut end | a perspective | an approach","1384090"),
    ("傷口","きずぐち","n","miệng vết thương | chỗ bị thương | vết cắt | vết thương hở","a wound | a cut","1345860"),
    ("甘口","あまくち","adj-na|adj-no|n","vị ngọt | nhạt | dịu | lời ngọt nịnh | sự ngây thơ khờ khạo","sweet (flavor) | mild | flattery","1213510"),
    ("辛口","からくち","n|adj-no","vị cay | vị đậm (rượu) | gay gắt | sắc bén | người thích rượu","dry (taste) | harsh | scathing","1609630"),
    ("軽口","かるくち","n|adj-no","nói đùa | lời pha trò | câu nói dí dỏm | hay tếu táo | bông đùa","witty remarks | light jokes | persiflage","1252690"),
    ("大口","おおぐち","n|adj-no","há to miệng | khoác lác | nói lớn lối | số lượng lớn | giao dịch lớn (大口注文)","boastful speech | a large amount","1643480"),
    ("小口","こぐち","n|adj-no","đầu cắt | mép (trang sách) | số lượng nhỏ | khoản nhỏ | manh mối","a small amount | the edge (of a page) | a clue","1639840"),
    ("糸口","いとぐち","n","manh mối | đầu mối | bước khởi đầu | gợi ý | mối gỡ (糸口をつかむ)","a clue | the beginning | the first step","1311470"),
    ("取っ掛かり","とっかかり","n","điểm khởi đầu | manh mối | chỗ bám | bước đầu | đầu mối","the beginning | a clue | a starting point","2556950"),
    ("足がかり","あしがかり","n","chỗ đặt chân | bàn đạp | điểm tựa | bước đệm | chỗ bám chân","a foothold | a stepping stone","1586370"),
    ("心当たり","こころあたり","n","điều nghĩ tới | có nghi vấn | tình cờ biết | manh mối trong đầu | sự liên tưởng","having (something) in mind | an inkling | an idea","1360890"),
    ("当て","あて","n|n-suf","mục đích | đích nhắm | kỳ vọng | chỗ dựa | miếng đệm | gửi cho | mỗi (当てが外れる)","an aim | expectations | a reliance | per","1448820"),
    ("当てずっぽう","あてずっぽう","n","đoán mò | phỏng đoán liều | nói bừa | đoán bừa | suy đoán hú họa","a random guess | a shot in the dark","2559600"),
    ("見当","けんとう","n|n-suf","ước lượng | phỏng đoán | dự đoán | phương hướng | khoảng chừng (見当がつく)","an estimate | a conjecture | direction | approximately","1259930"),
    ("腹案","ふくあん","n","kế hoạch ấp ủ | dự định trong đầu | phương án riêng | ý đồ thầm kín","one's (private) plan","1501130"),
    ("下地","したじ","n","nền tảng | cơ sở | tố chất | năng khiếu sẵn | lớp lót | kiến thức nền","groundwork | aptitude | an undercoat","1185920"),
    ("素地","そじ","n","tố chất | nền tảng sẵn có | cơ sở | tư chất | phôi thai","the makings of | aptitude | groundwork","1397330"),
    ("根幹","こんかん","n","gốc rễ | cốt lõi | nền tảng | căn bản | nòng cốt (gốc và thân)","the foundation | the core | the basis","1290100"),
    ("要石","かなめいし","n","đá then chốt | viên đá đỉnh vòm | yếu tố trụ cột | mấu chốt","a keystone","1546790"),
    ("柱石","ちゅうせき","n","trụ cột | rường cột | nền móng | chỗ dựa vững chắc | cột trụ","a pillar | a cornerstone","1426500"),
    ("屋台骨","やたいぼね","n","khung nhà | rường cột | trụ cột (kinh tế/gia đình) | nền tảng | xương sống","the framework | the mainstay | the backbone","1613690"),
    ("大黒柱","だいこくばしら","n","cột cái (nhà) | trụ cột gia đình | rường cột (kinh tế) | người trụ cột","the central pillar | the mainstay | the breadwinner","1413720"),
    ("仕掛け","しかけ","n","cơ chế | thiết bị | bẫy | mánh khóe | màn dàn dựng | sự khiêu khích | đang dở dang","a device | a mechanism | a trick | a setup","1594100"),
    ("絡繰り","からくり","n","cơ chế | bộ máy | mánh lới | mưu mẹo | con rối máy | thủ thuật ngầm","a mechanism | a contrivance | a trick","1003010"),
    ("楽屋裏","がくやうら","n","hậu trường | phòng hóa trang | chuyện bên trong | nội tình kín | sau cánh gà","backstage | the inside story","2525250"),
    ("水面下","すいめんか","n|adj-no","dưới mặt nước | ngấm ngầm | sau hậu trường | bí mật | âm thầm","underwater | behind the scenes","1372150"),
    ("氷山の一角","ひょうざんのいっかく","exp|n","phần nổi của tảng băng | bề nổi | một góc nhỏ của vấn đề lớn","the tip of the iceberg","2119000"),
    ("王道","おうどう","n|adj-no","vương đạo | con đường chính thống | cách làm đúng đắn | cai trị nhân nghĩa | đường tắt dễ dàng","the royal road | the orthodox way | an easy method","1181660"),
    ("不条理","ふじょうり","adj-na|n","phi lý | vô lý | nghịch lý | trái logic | sự bất hợp lý","absurd | irrational | absurdity","1492970"),
    ("屁理屈","へりくつ","n","lý sự cùn | ngụy biện | lập luận gượng ép | cãi chày cãi cối | bắt bẻ vô lý","sophistry | a far-fetched argument | a quibble","1566360"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
