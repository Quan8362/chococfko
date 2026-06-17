# -*- coding: utf-8 -*-
"""Build N1 ready wave 088 — katakana + rare 漢語 (set 88)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-088.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("アイデンティティ","アイデンティティ","n","bản sắc | căn tính | nhận dạng bản thân | sự nhận diện cái tôi","identity","1014270"),
    ("アウトレット","アウトレット","n","cửa hàng giảm giá | outlet | ổ cắm điện","outlet","1014900"),
    ("アグリビジネス","アグリビジネス","n","kinh doanh nông nghiệp | nông nghiệp công nghệ cao | ngành nông sản","agribusiness","1015560"),
    ("インフォームドコンセント","インフォームドコンセント","n","sự đồng ý sau khi được thông tin | sự chấp thuận có hiểu biết (y tế)","informed consent","1957480"),
    ("ウィークリー","ウィークリー","n|adv","hàng tuần | tuần báo | theo tuần","weekly","1025080"),
    ("エンパワーメント","エンパワーメント","n","sự trao quyền | việc tiếp thêm sức mạnh | nâng cao năng lực tự chủ","empowerment","2010260"),
    ("オーソリゼーション","オーソリゼーション","n","sự cấp phép | sự ủy quyền | sự cho phép chính thức","authorization","2835636"),
    ("カウンターオファー","カウンターオファー","n","đề nghị ngược lại | lời chào giá đối ứng | đề xuất phản hồi","counteroffer","2836444"),
    ("ガイドブック","ガイドブック","n","sách hướng dẫn | cẩm nang du lịch | sổ tay chỉ dẫn","guidebook","1039920"),
    ("クリエイティビティ","クリエイティビティ","n","tính sáng tạo | óc sáng tạo | khả năng sáng tạo","creativity","1044680"),
    ("ケミカル","ケミカル","adj-f","hóa học | hóa chất | tổng hợp nhân tạo","chemical","1048150"),
    ("コンプリート","コンプリート","adj-na|n|vs|vt","hoàn chỉnh | sự hoàn thành | sưu tập đủ bộ | trọn vẹn","complete","1053760"),
    ("シェアハウス","シェアハウス","n","nhà ở chung | nhà thuê chung | căn hộ ở ghép","share house","2510290"),
    ("ダイナミックレンジ","ダイナミックレンジ","n","dải động | phạm vi động (âm thanh/hình ảnh) | khoảng biến thiên","dynamic range","2307560"),
    ("チームビルディング","チームビルディング","n","xây dựng đội nhóm | gắn kết tập thể | hoạt động củng cố đội","team building","2864763"),
    ("デジタルデバイド","デジタルデバイド","n","khoảng cách số | sự chênh lệch về công nghệ thông tin","digital divide","2025810"),
    ("パブリックドメイン","パブリックドメイン","n","phạm vi công cộng | tài sản công cộng | hết bản quyền","public domain","1102360"),
    ("ヒューリスティック","ヒューリスティック","adj-na|n","kinh nghiệm suy đoán | phương pháp thử nghiệm | heuristic","heuristic","1104160"),
    ("ファシリテーション","ファシリテーション","n","sự điều phối | sự hỗ trợ tiến trình (cuộc họp) | sự tạo điều kiện","facilitation","2866655"),
    ("フォーキャスト","フォーキャスト","n","dự báo | dự đoán | sự tiên lượng","forecast","2450590"),
    ("プラグマティスト","プラグマティスト","n","người theo chủ nghĩa thực dụng | người thực tế | nhà thực dụng","pragmatist","2507100"),
    ("プロパゲーション","プロパゲーション","n","sự lan truyền | sự phát tán | sự nhân giống","propagation","1117750"),
    ("ベンチャービジネス","ベンチャービジネス","n","doanh nghiệp khởi nghiệp | kinh doanh mạo hiểm | công ty startup","venture business","1120350"),
    ("マインドセット","マインドセット","n","tư duy | lối suy nghĩ | tâm thế | quan niệm","mindset","2728630"),
    ("マテリアリズム","マテリアリズム","n","chủ nghĩa duy vật | chủ nghĩa vật chất | lối sống vật chất","materialism","1128570"),
    ("リアリティ","リアリティ","n","tính chân thực | sự thực tế | cảm giác như thật","reality","1140980"),
    ("リーガル","リーガル","n","pháp lý | hợp pháp | thuộc luật pháp","legal","1140440"),
    ("リフレーミング","リフレーミング","n","sự tái định khung | thay đổi cách nhìn nhận | nhìn lại theo hướng tích cực","reframing","2472740"),
    ("レジリエンス","レジリエンス","n","khả năng phục hồi | sức bền bỉ | sự dẻo dai vượt khó","resilience","2537320"),
    ("ロールモデル","ロールモデル","n","hình mẫu noi theo | tấm gương | người làm gương","role model","2077570"),
    ("亜麻色","あまいろ","n|adj-no","màu lanh | màu be nhạt | màu vàng nâu nhạt | màu lanh nhạt","flax color | beige","1784360"),
    ("畏服","いふく","n|vs","sự kính nể | sự khâm phục mà tuân theo | nể sợ quy phục","awe | submission out of respect","1157480"),
    ("鬱蒼","うっそう","adj-t|adv-to","um tùm | rậm rạp | sum suê | rợp bóng cây","thick | dense | luxuriant (foliage)","1588280"),
    ("役務","えきむ","n","dịch vụ | công việc phục vụ | lao vụ | nghĩa vụ lao động","labour | service","1624340"),
    ("横臥","おうが","n|vs|vi|adj-no","nằm nghiêng | nằm ngả người | tư thế nằm nghiêng","lying on one's side","1180650"),
    ("鴎","カモメ","n","hải âu | mòng biển | chim mòng","seagull | gull","1181750"),
    ("苛斂誅求","かれんちゅうきゅう","n","sưu cao thuế nặng | vơ vét hà khắc | bóc lột thuế khóa tàn bạo","exaction of heavy, oppressive taxes","2030200"),
    ("晦冥","かいめい","n","tăm tối | u ám mịt mùng | bóng tối dày đặc","darkness","1773210"),
    ("攪拌","かくはん","n|vs|vt","sự khuấy trộn | đánh tan | trộn đều | quấy","agitation | stirring | whipping","1205260"),
    ("廓清","かくせい","n|vs|vt","sự thanh lọc | sự làm trong sạch | sự thanh trừng | dọn dẹp tệ nạn","purification | cleaning up | purging","1617570"),
    ("仮寓","かぐう","n|vs|vi","chỗ ở tạm | nơi trú tạm | tạm trú","a temporary residence","1187420"),
    ("莞爾","かんじ","adv-to|adj-t","mỉm cười | nở nụ cười tươi | tươi cười rạng rỡ","smiling","2172650"),
    ("詭激","きげき","adj-na|n","cực đoan | quá khích | gay gắt cường điệu","extreme | radical","2844344"),
    ("跪拝","きはい","n|vs|vi","quỳ lạy | quỳ gối bái lạy | phủ phục thờ phụng","kneeling and worshipping","2838150"),
    ("亀甲","きっこう","n","mai rùa | họa tiết mai rùa | hình lục giác | hoa văn tổ ong","tortoiseshell | hexagonal pattern","1224300"),
    ("匡正","きょうせい","n|vs|vt","sự uốn nắn | sự sửa sai | sự chỉnh đốn | sự cải tà quy chính","correction | rectification | reform","1235860"),
    ("驕奢","きょうしゃ","adj-na|n","xa hoa | xa xỉ | hoang phí | xa hoa kiêu sa","luxury | extravagance","1574610"),
    ("欣喜","きんき","n|vs|vi","hân hoan | vui mừng | hớn hở | mừng rỡ (欣喜雀躍)","pleasure | joy","1845210"),
    ("欣然","きんぜん","adj-t|adv-to","vui vẻ | hớn hở | hân hoan | vui lòng","joyful | cheerful","1845220"),
    ("卦","け","n","quẻ bói | quẻ | hào | quẻ dịch","a divination sign","1956160"),
    ("畦","あぜ","n","bờ ruộng | bờ đất giữa ruộng | lối đi giữa ruộng | bờ thửa","a ridge between rice fields","1250980"),
    ("頸動脈","けいどうみゃく","n","động mạch cảnh | mạch máu cổ","carotid artery","1252970"),
    ("迎撃機","げいげきき","n","máy bay đánh chặn | tiêm kích đánh chặn | phi cơ nghênh chiến","interceptor aircraft","1253240"),
    ("鶏冠","とさか","n","mào gà | mồng gà | cái mào","cockscomb | crest","1578270"),
    ("桁違い","けたちがい","adj-na|n","khác biệt một trời một vực | hơn hẳn nhiều bậc | chênh lệch quá lớn | sai một con số","off by an order of magnitude | in a different league","1686140"),
    ("懸隔","けんかく","n|vs|vi","sự cách biệt | sự chênh lệch | khoảng cách | sự khác xa","difference | discrepancy","1257680"),
    ("顕現","けんげん","n|vs|vt|vi","sự hiển hiện | sự bộc lộ rõ | sự hiện ra | sự biểu lộ","manifestation","1260610"),
    ("狷介","けんかい","adj-na","cố chấp | ngoan cố | gàn dở | tự cô lập | khó gần","obstinate | stubborn | self-centred","1957390"),
    ("倦厭","けんえん","n|vs|vi","sự chán ngán | sự ngán ngẩm | sự nhàm chán | sự uể oải","weariness","1256040"),
    ("膠漆","こうしつ","n","keo và sơn | tình thân khăng khít | sự gắn bó keo sơn (膠漆の交わり)","glue and lacquer | great intimacy","1571080"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
