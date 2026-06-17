# -*- coding: utf-8 -*-
"""Build N1 ready wave 051 — 四字熟語 + literary 漢語 (set 51)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-051.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("哀歓","あいかん","n","vui buồn | hỉ nộ ái ố | niềm vui nỗi buồn | buồn vui lẫn lộn","joys and sorrows","1150200"),
    ("愛別離苦","あいべつりく","n","ái biệt ly khổ | nỗi đau chia lìa người thương | khổ vì xa cách","the pain of separation from loved ones","1791470"),
    ("青天井","あおてんじょう","n","trời xanh | không trần | tăng vô hạn (giá) | không giới hạn","blue sky | skyrocketing | the sky's the limit","1381660"),
    ("悪因悪果","あくいんあっか","n","ác giả ác báo | gieo ác gặt ác | nhân quả báo ứng","evil acts bring evil outcomes","1151410"),
    ("悪戦","あくせん","n|vs","chiến đấu cam go | đánh vật lộn | trận đánh ác liệt (悪戦苦闘)","hard fighting | a close contest","1152150"),
    ("暗中飛躍","あんちゅうひやく","n|vs","hoạt động ngầm | thao túng sau hậu trường | đi đêm | giật dây trong bóng tối","behind-the-scenes maneuvering","1684110"),
    ("暗中","あんちゅう","n","trong bóng tối | mò mẫm trong đêm | mịt mù (暗中模索)","in the dark","1154650"),
    ("一衣帯水","いちいたいすい","n","cách nhau một dải nước | gần kề trong gang tấc | láng giềng sát vách","being separated only by a narrow strip of water","1161060"),
    ("一意","いちい","n|adv|adj-no|adj-na","một lòng | chuyên tâm | dốc lòng | duy nhất (一意専心)","wholeheartedly | single-mindedly | unique","1161040"),
    ("一望千里","いちぼうせんり","n","tầm mắt bao la | nhìn xa ngàn dặm | mênh mông bát ngát | thoáng đãng vô tận","a boundless expanse | a sweeping view","1166590"),
    ("一文","いちもん","n","một xu | chút tiền nhỏ | một chữ | một đồng (一文無し: không một xu)","a penny | one character | a tiny amount of money","1166340"),
    ("一葉","いちよう","n","một chiếc lá | một tờ | một tấm (ảnh) | một con thuyền","one leaf | one sheet | one photo","1167140"),
    ("一騎当千","いっきとうせん","n|adj-no","một địch ngàn | dũng tướng vạn người khôn địch | sức địch muôn người","being a match for a thousand | a mighty warrior","1161770"),
    ("一切","いっさい","n|adj-no|adv","tất cả | toàn bộ | hết thảy | hoàn toàn (không) | tuyệt nhiên","all | everything | (not) at all | without exception","1164170"),
    ("一糸乱れず","いっしみだれず","exp","răm rắp trật tự | ngay hàng thẳng lối | đều tăm tắp | nề nếp tuyệt đối","in perfect order","1847090"),
    ("一字千金","いちじせんきん","n","một chữ đáng ngàn vàng | câu chữ quý giá | lời vàng ý ngọc","a word of great value","1162910"),
    ("一宿一飯","いっしゅくいっぱん","n","ơn một bữa cơm một đêm trọ | chịu ơn nhỏ | ơn nghĩa dù nhỏ","being indebted for a meal and a night's lodging","1163330"),
    ("一所","いっしょ","n","một nơi | cùng chỗ | cùng nhau | một người (一所懸命)","one place | together","1576120"),
    ("一触即発","いっしょくそくはつ","n|adj-no","ngàn cân treo sợi tóc | căng như dây đàn | chỉ chực bùng nổ | nhất xúc tức phát","a touch-and-go situation | an explosive situation","1163550"),
    ("一寸先は闇","いっすんさきはやみ","exp","không ai biết trước tương lai | tương lai mờ mịt | họa phúc khôn lường","no one knows what the future holds","1981600"),
    ("一石","いっせき","n","một ván cờ (vây) | một viên đá (一石を投じる: gây xôn xao)","one game (of go) | one stone","1164150"),
    ("一銭","いっせん","n","một xu | một sen | chút tiền lẻ | một phần trăm yên","one sen | a small amount of money","2005930"),
    ("一掃","いっそう","n|vs|vt","quét sạch | xóa sổ | trừ tận gốc | thanh trừng | loại bỏ hoàn toàn","a clean sweep | eradication | purging","1164350"),
    ("一徹","いってつ","adj-na|adj-no|n","cố chấp | bướng bỉnh | ngoan cố | khăng khăng một mực","obstinate | stubborn | inflexible","1165020"),
    ("一得一失","いっとくいっしつ","n","được cái này mất cái kia | có lợi có hại | lợi bất cập hại","having both advantages and disadvantages","1165380"),
    ("一敗","いっぱい","n|vs|vi","một trận thua | thua một keo (一敗地に塗れる: đại bại)","one defeat","1165660"),
    ("一髪","いっぱつ","n","sợi tóc | gang tấc | trong đường tơ kẽ tóc (危機一髪)","a hair | a hair's breadth","1165750"),
    ("一片","いっぺん","n","một mảnh | một mẩu | chút ít | mảy may | một tờ (một mảnh giấy)","a piece | a scrap | a fragment | the slightest bit","1166430"),
    ("雲煙","うんえん","n","mây khói | sương mù | cảnh sơn thủy (tranh) (雲煙過眼: thoáng qua)","clouds and smoke | a landscape painting","1833200"),
    ("雲集","うんしゅう","n|vs|vi","tụ tập đông đảo | kéo đến nườm nượp | quây quần như mây","swarming | thronging","1833190"),
    ("雲霧","うんむ","n","mây mù | mây và sương | sương khói mịt mù","clouds and fog","1173270"),
    ("盈虚","えいきょ","n|vs|vi","trăng tròn khuyết | thịnh suy | thăng trầm vận mệnh | đầy vơi","waxing and waning | the rise and fall of fortune","2567640"),
    ("鋭意","えいい","adv","hăng hái | nỗ lực hết mình | dốc sức | chuyên tâm | tích cực","eagerly | diligently | wholeheartedly","1174900"),
    ("栄達","えいたつ","n|vs|vi","thăng tiến | hiển đạt | công thành danh toại | vinh hiển","rise | advancement | distinction","1173940"),
    ("英邁","えいまい","adj-na|n","anh minh | tài giỏi xuất chúng | sáng suốt lỗi lạc","wise and great","1784540"),
    ("回向","えこう","n|vs|vi","hồi hướng | cầu siêu | tụng kinh cầu siêu thoát | chuyển công đức","a memorial service | prayers for the dead","1613850"),
    ("依怙","えこ","n","thiên vị | bênh vực một phía | thiên lệch | thành kiến","favoritism | partiality | bias","1155750"),
    ("円光","えんこう","n","vầng hào quang | quầng sáng | hào quang (sau lưng Phật)","a halo","1175810"),
    ("延々","えんえん","adv-to|adj-t","triền miên | dằng dặc | lê thê | quanh co kéo dài | không dứt","endlessly | going on and on | winding","1588770"),
    ("燕雀","えんじゃく","n","chim sẻ chim én | kẻ tầm thường | người thiển cận (燕雀安んぞ鴻鵠の志を知らんや)","a small bird | a small-minded person","1177360"),
    ("遠大","えんだい","adj-na|n","cao xa | lớn lao | sâu rộng | đầy hoài bão | viễn đại","grand | far-reaching | ambitious","1178290"),
    ("鴛鴦","えんおう","n","uyên ương | đôi vịt uyên ương | (biểu tượng vợ chồng hòa hợp)","a mandarin duck","2864186"),
    ("怪奇","かいき","adj-na|n","kỳ quái | quái dị | huyền bí | rùng rợn | bí ẩn (怪奇現象)","bizarre | strange | mysterious | grotesque","1200240"),
    ("開眼","かいがん","n|vs|vi|vt","khai nhãn | giác ngộ | bừng tỉnh ngộ đạo | điểm nhãn (tượng Phật)","spiritual awakening | enlightenment | consecrating a statue","1202590"),
    ("偕老","かいろう","n","sống bên nhau đến già | bạc đầu giai lão | chung sống trọn đời (偕老同穴)","growing old together","1563770"),
    ("活況","かっきょう","n|adj-na|adj-no","sôi động | nhộn nhịp | hưng thịnh | phồn vinh (thị trường)","activity | briskness | prosperity","1208280"),
    ("喝采","かっさい","n|vs|vi","hoan hô | tán thưởng | vỗ tay reo hò | tung hô | tán dương","cheers | applause | an ovation","1208170"),
    ("合掌","がっしょう","n|vs|vi|exp","chắp tay | hợp chưởng | chắp tay cầu nguyện | kính bái (cuối thư)","pressing one's hands together in prayer","1284920"),
    ("渇望","かつぼう","n|vs|vt","khao khát | thèm muốn | mong mỏi cháy bỏng | ước ao da diết","craving | longing | thirsting for","1208540"),
    ("気韻生動","きいんせいどう","n","khí vận sinh động | sống động tao nhã | tranh có thần khí","being vividly animated with grace","2043380"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
