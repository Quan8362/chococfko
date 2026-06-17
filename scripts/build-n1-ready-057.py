# -*- coding: utf-8 -*-
"""Build N1 ready wave 057 — literary 漢語 (set 57)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-057.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("勅命","ちょくめい","n","sắc lệnh hoàng đế | chiếu mệnh | mệnh lệnh của vua","an imperial command","1430520"),
    ("直情径行","ちょくじょうけいこう","adj-na|n","bộc trực thẳng thắn | nghĩ sao làm vậy | thẳng tính ngay thật","impulsive and straightforward | guileless","1431060"),
    ("貯水","ちょすい","n|vs|vt|vi","trữ nước | tích nước | dự trữ nước (貯水池: hồ chứa)","storage of water","1427200"),
    ("直筆","じきひつ","n|adj-no","bút tích | nét chữ chính tay | chữ viết tay của ai đó","one's own handwriting | autograph","1431500"),
    ("珍奇","ちんき","adj-na|n","kỳ lạ | hiếm có | mới lạ | quái lạ | tân kỳ","strange | rare | novel | curious","1431860"),
    ("鎮魂歌","ちんこんか","n","khúc cầu hồn | bài ca an hồn | nhạc cầu siêu | requiem","a requiem","2451760"),
    ("痛打","つうだ","n|vs|vt","đòn chí mạng | cú đánh đau | giáng đòn nặng | đả kích mạnh","a hard blow | a crushing blow","1652570"),
    ("通弊","つうへい","n","tệ nạn chung | thói xấu phổ biến | khuyết điểm chung","a common evil | a common fault","1687510"),
    ("痛憤","つうふん","n|vs|vt|vi","phẫn nộ tột độ | căm phẫn sâu sắc | uất ức cao độ","strong indignation","1432810"),
    ("諦念","ていねん","n","sự buông bỏ | thấu hiểu chấp nhận | giác ngộ cam chịu | thái độ thản nhiên","understanding and acceptance | resignation","2015510"),
    ("泥土","でいど","n","bùn đất | đất bùn | bùn nhão","mud","1437010"),
    ("摘要","てきよう","n|vs|vt","tóm tắt | trích yếu | đề cương | mục ghi chú","a summary | an outline | remarks","1437090"),
    ("鉄則","てっそく","n","quy tắc bất di bất dịch | nguyên tắc sắt | luật lệ cứng nhắc | quy luật bất biến","an ironclad rule | an inviolable principle","1437950"),
    ("轍","わだち","n","vết bánh xe | rãnh xe | lối mòn | dấu vết (轍を踏む: đi vào vết xe đổ)","a rut | a wheel track","1437770"),
    ("鉄壁","てっぺき","n|adj-no","thành đồng vách sắt | phòng thủ kiên cố | bất khả xâm phạm | vững như bàn thạch","an iron wall | an impregnable fortress","1779800"),
    ("手薄","てうす","adj-na|n","thiếu người | mỏng manh | sơ hở | thiếu hụt | ít ỏi (hàng/tiền)","shorthanded | undermanned | in short supply","1616340"),
    ("天涯比隣","てんがいひりん","exp","cách xa mà gần | dù xa vạn dặm vẫn như kề bên | tình thân không kể khoảng cách","a great distance does not lessen one's bond","2050530"),
    ("天衣","てんい","n","thiên y | xiêm y nhà trời | áo tiên (天衣無縫: tự nhiên hoàn mỹ)","a heavenly garment","1438320"),
    ("天恵","てんけい","n","ơn trời | phúc trời ban | tài nguyên thiên nhiên | quà tặng của tạo hóa","Heaven's blessing | a gift of nature","1438940"),
    ("天工","てんこう","n","tạo hóa | kỳ công của trời đất | tác phẩm của thiên nhiên","the work of nature","1438990"),
    ("天授","てんじゅ","n","trời ban | thiên phú | năng khiếu bẩm sinh | tài trời cho","natural gifts | heaven-sent talent","1439350"),
    ("天寿","てんじゅ","n","tuổi trời | thọ mệnh tự nhiên | tuổi thọ trời định (天寿を全うする)","one's natural span of life","1439340"),
    ("天測","てんそく","n|vs|vt","quan trắc thiên văn | đo thiên thể | định vị bằng sao","astronomical observation","1439720"),
    ("天日","てんじつ","n","mặt trời | vầng thái dương | ánh nắng mặt trời (天日干し: phơi nắng)","the Sun","2834976"),
    ("顛末書","てんまつしょ","n","bản tường trình | báo cáo chi tiết sự việc | bản giải trình đầu đuôi","a detailed written report (of an incident)","2820920"),
    ("電撃","でんげき","n|adj-f","sét đánh | tấn công chớp nhoáng | gây sốc đột ngột | điện giật (電撃結婚)","an electric shock | a lightning attack | sudden","1443200"),
    ("天与","てんよ","n","trời ban | của trời cho | thiên phú | món quà trời ban","a godsend | heaven's gift","1440440"),
    ("桃花","とうか","n","hoa đào | hoa cây đào","a peach blossom","1896680"),
    ("陶器","とうき","n","đồ gốm | gốm sứ | đồ sành | đồ đất nung","pottery | ceramics | earthenware","1450610"),
    ("動議","どうぎ","n","kiến nghị (cuộc họp) | đề xuất | đề nghị biểu quyết","a motion (at a meeting)","1451320"),
    ("東西","とうざい","n|adj-no|int","đông tây | phương Đông và phương Tây | thưa quý vị! | xin chú ý!","east and west | the Orient and Occident","1447910"),
    ("透視","とうし","n|vs|vt","nhìn xuyên thấu | thấu thị | chụp X-quang | nhãn thông | thấu thị tâm linh","seeing through | fluoroscopy | clairvoyance","1450560"),
    ("当主","とうしゅ","n","đương gia | chủ gia đình hiện tại | người đứng đầu dòng họ","the present head of a family","1783960"),
    ("等身","とうしん","n|adj-no","cỡ người thật | bằng kích cỡ cơ thể (等身大: như người thật)","life-size | body proportions","1449490"),
    ("闘志満々","とうしまんまん","adj-no|adj-t|adv-to","tràn đầy ý chí chiến đấu | hừng hực khí thế | sục sôi tinh thần chiến đấu","brimming with fighting spirit","2032110"),
    ("当代","とうだい","n|adj-no|adv","đương đại | thời nay | đương thời | đời này | đương gia","the present age | these days","1783920"),
    ("堂塔","どうとう","n","đền và tháp | quần thể chùa chiền | điện đài lầu tháp (堂塔伽藍)","temple buildings | temples and towers","1898320"),
    ("逃避行","とうひこう","n","cuộc đào tẩu | chuyến trốn chạy | hành trình lẩn trốn | bỏ trốn lánh đời","a runaway trip | a flight from the world","1808470"),
    ("透徹","とうてつ","n|vs|vi","trong suốt | thấu suốt | mạch lạc rõ ràng | sáng tỏ tinh tường","transparency | clarity | coherence","1450580"),
    ("桃李","とうり","n","đào lý | người được tiến cử | môn sinh (桃李物言わざれども下自ら蹊を成す)","peach and plum | one's recommended people","1661770"),
    ("徳化","とっか","n|vs|vt","cảm hóa bằng đức độ | giáo hóa bằng đạo đức | đức cảm","moral influence | edification","1788700"),
    ("独酌","どくしゃく","n|vs|vi","uống rượu một mình | độc ẩm | tự rót tự uống | nhâm nhi một mình","drinking alone","1455820"),
    ("独唱","どくしょう","n|vs|vt","đơn ca | hát solo | độc xướng","a vocal solo","1455840"),
    ("特筆大書","とくひつたいしょ","n|vs|vt","viết to nhấn mạnh | ghi đậm nét | nêu bật đặc biệt | đáng ghi nhớ lớn","writing in large letters | highlighting prominently","1789250"),
    ("読本","とくほん","n","sách đọc | sách giáo khoa | sách hướng dẫn | cẩm nang nhập môn","a reader | a guidebook | a primer","1582400"),
    ("独楽","こま","n","con quay | con vụ | cù quay","a spinning top","1455730"),
    ("土豪","どごう","n","thổ hào | cường hào địa phương | hào trưởng | địa chủ thế lực","a powerful local clan | a local strongman","1956730"),
    ("鈍才","どんさい","n","kẻ chậm hiểu | người đần độn | trí tuệ kém | ngu độn","a dull person | dullness","1624080"),
    ("頓首","とんしゅ","n|vs","khấu đầu | cúi lạy sát đất | dập đầu | kính thư (cuối thư)","kowtowing | respectfully yours","2659630"),
    ("泣き別れ","なきわかれ","n|vs|vi","chia tay đẫm nước mắt | ly biệt trong nước mắt | đành mỗi người một ngả","a tearful parting | going separate ways","1229780"),
    ("情け知らず","なさけしらず","adj-no|adj-na|n","vô tình | nhẫn tâm | lạnh lùng | không chút lòng thương | sắt đá","coldhearted | pitiless | merciless","1599470"),
    ("亡き者","なきもの","n","người đã khuất | kẻ đã chết | người quá cố (亡き者にする: thủ tiêu)","a dead person","1518490"),
    ("南面","なんめん","n|vs|vi","hướng nam | mặt nam | ngoảnh mặt về nam | lên ngôi trị vì","facing south | ascending the throne","1460670"),
    ("難問","なんもん","n|vs","câu hỏi hóc búa | bài toán khó | vấn đề nan giải | khó khăn rắc rối","a difficult question | a knotty problem","1461130"),
    ("二元","にげん","n|adj-no","nhị nguyên | hai yếu tố | nhị phân | lưỡng nguyên (二元論)","duality | binary","1954180"),
    ("日参","にっさん","n|vs|vi","đi lễ hằng ngày | lui tới thường xuyên | đến đều đặn mỗi ngày","a daily visit (to a shrine) | visiting frequently","1643160"),
    ("如実","にょじつ","n","đúng như thực | chân thực sống động | thực tế đích thực | y như thật","reality | actuality | a faithful representation","1467020"),
    ("任侠","にんきょう","n|n-pref","hiệp nghĩa | tinh thần hào hiệp | giúp kẻ yếu chống kẻ mạnh | nghĩa hiệp","chivalry | a chivalrous spirit","1467220"),
    ("人形浄瑠璃","にんぎょうじょうるり","n","kịch rối Nhật | múa rối kèm hát kể đệm shamisen | tiền thân của bunraku","Japanese puppet theatre (forerunner of bunraku)","1637390"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
