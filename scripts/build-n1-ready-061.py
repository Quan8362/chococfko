# -*- coding: utf-8 -*-
"""Build N1 ready wave 061 — literary 漢語 (set 61, ra-wa)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-061.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("楽園","らくえん","n","thiên đường | lạc viên | vườn địa đàng | chốn bồng lai","paradise | Eden","1207290"),
    ("裸体","らたい","n","thân thể trần truồng | khỏa thân | lõa thể","a naked body | nudity","1547670"),
    ("乱雑","らんざつ","n|adj-na","bừa bộn | lộn xộn | hỗn độn | lung tung | bừa bãi","disorder | clutter | mess","1548990"),
    ("乱心","らんしん","n|vs|vi","loạn trí | điên loạn | mất trí | rối loạn tâm thần","mental derangement | madness","1549020"),
    ("乱世","らんせい","n","thời loạn | loạn thế | thời buổi nhiễu nhương | thời tao loạn","troubled times | turbulent times","1643960"),
    ("乱筆","らんぴつ","n","chữ viết cẩu thả | bút tích nguệch ngoạc | viết vội (乱筆乱文)","hasty, careless writing | a scribble","1549080"),
    ("乱立","らんりつ","n|vs|vi","mọc lên lộn xộn | tranh cử ồ ạt | san sát chen chúc | quá nhiều ứng viên","standing close together disorderly | too many candidates","1549130"),
    ("理会","りかい","n|vs|vt","lĩnh hội | thấu hiểu | nhận thức | thông tỏ","comprehension | understanding","2623440"),
    ("利害","りがい","n","lợi hại | được mất | lợi ích các bên | quyền lợi (利害関係)","advantages and disadvantages | interests","1549500"),
    ("利剣","りけん","n","kiếm sắc | gươm bén | thanh kiếm lợi hại","a sharp sword","2773460"),
    ("離合","りごう","n|vs|vi","hợp tan | tụ tán | gặp gỡ và chia ly | liên kết và rạn vỡ (離合集散)","alliance and rupture | meeting and parting","1644250"),
    ("罹災","りさい","n|vs|vi","bị nạn | gặp thiên tai | chịu tai họa | bị thiệt hại (罹災者)","suffering from a calamity | affliction","1567000"),
    ("立志伝","りっしでん","n","tiểu sử lập thân | câu chuyện thành công | hành trình gây dựng sự nghiệp","a success story","1837930"),
    ("理法","りほう","n","quy luật | lẽ phải | đạo lý | phép tắc | nguyên lý","a law | a principle","1550130"),
    ("流寓","りゅうぐう","n|vs","sống tha hương | lưu lạc xứ người | phiêu bạt định cư đất khách","living a wandering life in a foreign land","2841483"),
    ("流民","るみん","n","dân tị nạn | dân lưu vong | lưu dân | dân chạy loạn","refugees | displaced people","1650770"),
    ("竜攘虎搏","りゅうじょうこはく","n","rồng cọp giao tranh | cuộc đọ sức dữ dội | trận chiến long hổ tranh hùng","fierce fighting (between two great rivals)","1553050"),
    ("凌雲","りょううん","adj-no","vút trời | cao ngất tầng mây | siêu thoát trần tục | chí cao vợi (凌雲の志)","skyscraping | above the clouds | lofty","1554210"),
    ("両極","りょうきょく","n","hai cực | nam bắc cực | cực âm dương | hai thái cực (両極端)","both extremes | the two poles","1553520"),
    ("良工","りょうこう","n","thợ giỏi | nghệ nhân lành nghề | bậc thầy thủ công","a skilled artisan","1775160"),
    ("良妻","りょうさい","n","người vợ hiền | vợ đảm | hiền thê (良妻賢母)","a good wife","1554560"),
    ("寮生","りょうせい","n","học sinh nội trú | sinh viên ở ký túc xá | người ở trọ ký túc","a boarding student","1554240"),
    ("良知良能","りょうちりょうのう","n","trí năng bẩm sinh | tài trí thiên phú | khả năng trời cho","one's innate intelligence and ability","2055010"),
    ("両刀","りょうとう","n","hai thanh kiếm | giỏi cả hai môn | người vừa thích rượu vừa thích ngọt | song kiếm","two swords | expert in two fields","1553910"),
    ("良能","りょうのう","n","năng lực bẩm sinh | khả năng tự nhiên | tài năng vốn có","natural ability","1775330"),
    ("緑陰","りょくいん","n","bóng cây xanh | bóng mát tán lá | bóng râm cây cối","the shade of trees","1644900"),
    ("燐光","りんこう","n","lân quang | ánh lân tinh | sự phát quang lạnh","phosphorescence","1757920"),
    ("臨月","りんげつ","n","tháng sinh nở | tháng cuối thai kỳ | tháng sắp đẻ | tháng lâm bồn","the final month of pregnancy","1555600"),
    ("輪奐","りんかん","n","công trình nguy nga | tòa nhà tráng lệ rộng lớn | dinh thự đồ sộ","a grand and splendid building","2197730"),
    ("林立","りんりつ","n|vs|vi","mọc san sát | dựng đứng chi chít | tua tủa | rừng cao ốc","standing close together | bristling with","1555520"),
    ("燐寸","マッチ","n","que diêm | diêm quẹt | bao diêm","a match (for lighting)","1128430"),
    ("類同","るいどう","adj-na|n","tương đồng | giống loại | cùng kiểu | đồng dạng","similar | of the same type","1739160"),
    ("縷々","るる","adv|adv-to|adj-t","tỉ mỉ | cặn kẽ | dài dòng chi tiết | liên tục không dứt","in detail | at great length | unceasing","1796500"),
    ("流浪","るろう","n|vs|vi","lưu lạc | phiêu bạt | lang thang | sống nay đây mai đó (流浪の民)","vagrancy | wandering | nomadism","1552590"),
    ("霊位","れいい","n","bài vị | linh vị | thần chủ thờ cúng","a memorial tablet","1758600"),
    ("霊感","れいかん","n","linh cảm | nguồn cảm hứng | khả năng cảm nhận tâm linh | giác quan thứ sáu","inspiration | the ability to sense the supernatural","1557770"),
    ("冷厳","れいげん","adj-na|n","lạnh lùng nghiêm khắc | tàn nhẫn | khắc nghiệt | sắt đá (冷厳な事実)","grim | stern | stark | heartless","1556940"),
    ("零落","れいらく","n|vs|vi","sa sút | lụn bại | tàn tạ | sa cơ thất thế | suy vi","falling into ruin | downfall","1644050"),
    ("歴世","れきせい","n","các đời nối tiếp | đời đời | các thế hệ kế tiếp | lịch đại","successive generations","1558190"),
    ("轢殺","れきさつ","n|vs|vt","cán chết | giết do xe cán | tử vong vì bị nghiến","killing by running over","1796840"),
    ("連衡","れんこう","n|vs","liên hoành | liên minh (chư hầu với Tần) | sách lược kết minh (合従連衡)","alliance (of states)","1916670"),
    ("廉直","れんちょく","adj-na|n","liêm chính | ngay thẳng trong sạch | thanh liêm chính trực","integrity | uprightness","1644100"),
    ("廉売","れんばい","n|vs|vt","bán hạ giá | bán rẻ | bán khuyến mãi | đại hạ giá","a bargain sale","1558660"),
    ("連峰","れんぽう","n","dãy núi | rặng núi nối tiếp | quần thể núi","a mountain range","1559780"),
    ("連理","れんり","n","cành cây quấn nhau | tình duyên gắn bó | vợ chồng keo sơn (比翼連理)","entwined branches | an intimate relationship","1636980"),
    ("牢","ろう","n|adj-t","nhà tù | ngục | lao | vững chắc | kiên cố","a prison | a jail | firm | solid","2253720"),
    ("朗詠","ろうえい","n|vs","ngâm thơ | xướng họa | đọc thơ ngân nga (thơ Hán/Nhật)","reciting (a poem)","1560720"),
    ("六腑","ろっぷ","n","lục phủ | sáu tạng phủ (五臓六腑)","the six internal organs (Chinese medicine)","1561570"),
    ("炉辺","ろへん","n","bên lò sưởi | cạnh bếp lửa | quanh lò ấm (炉辺談話)","the fireside","1844470"),
    ("論及","ろんきゅう","n|vs|vi","đề cập | bàn luận tới | nhắc đến | luận bàn về","mention | reference to | touching upon","1618680"),
    ("和衷協同","わちゅうきょうどう","n|vs","đồng tâm hiệp lực | hợp tác hòa thuận | chung lưng đấu cật | đoàn kết một lòng","harmonious cooperation","2055380"),
    ("若人","わこうど","n","người trẻ tuổi | thanh niên | tuổi trẻ | lớp trẻ","a young person","1324370"),
    ("業師","わざし","n","tay lão luyện | kẻ mưu mẹo | đô vật giỏi ngón đòn | người ranh ma","a tricky wrestler | a shrewd fellow","1855010"),
    ("割符","わりふ","n","thẻ đối chiếu | mảnh khớp làm bằng chứng | tín bài chia đôi","a tally | a token split as proof","1606960"),
    ("和を結ぶ","わをむすぶ","exp|v5b","làm hòa | kết giao hòa hảo | giảng hòa | hòa giải","to make peace","1917740"),
    ("亜流","ありゅう","n","kẻ bắt chước | bản nhái kém | người a dua theo trường phái | đồ đệ tầm thường","an inferior imitator | an epigone | a follower","1149930"),
    ("扼殺","やくさつ","n|vs|vt","bóp cổ giết | siết cổ tử vong | giết bằng tay","strangulation (by hand)","1760040"),
    ("夷","えびす","n","người Ainu | kẻ quê mùa | võ sĩ thô lậu | rợ | man di | người ngoại tộc","barbarian | provincial | the Ainu","1156020"),
    ("迂闊","うかつ","adj-na","bất cẩn | sơ ý | khinh suất | thiếu thận trọng | hớ hênh","careless | thoughtless | heedless | inadvertent","1171890"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
