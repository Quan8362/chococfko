# -*- coding: utf-8 -*-
"""Build N1 ready wave 005 — formal adjectives/nouns (set 5)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-005.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("愛想","あいそ","n","sự thân thiện | hòa nhã | lời xã giao | hóa đơn (tiệm ăn)","amiability | friendliness | civilities | bill (restaurant)","1575660"),
    ("潔い","いさぎよい","adj-i","dứt khoát | quân tử | cao thượng | trong sạch | thanh thản","gracious | honourable | manly | pure (heart)","1254440"),
    ("依存","いぞん","n|vs|vt|vi","phụ thuộc | lệ thuộc | dựa dẫm","dependence | reliance","1575870"),
    ("否む","いなむ","v5m|vt","từ chối | chối từ | phủ nhận","to refuse | to decline | to deny","1482910"),
    ("営利","えいり","n","vụ lợi | kiếm lời | thương mại hóa | vì lợi nhuận","money-making | commercialized | for profit","1173570"),
    ("婉然","えんぜん","adv-to|adj-t","yêu kiều | duyên dáng | yểu điệu","graceful | beautiful","2172540"),
    ("果敢","かかん","adj-na","quả cảm | quyết đoán | táo bạo | gan dạ","resolute | determined | bold","1192920"),
    ("偏屈","へんくつ","adj-na|n","cố chấp | gàn dở | hẹp hòi | lập dị | khó tính","narrow-minded | obstinate | perverse | eccentric","1603230"),
    ("緩慢","かんまん","adj-na|n","chậm chạp | lờ đờ | uể oải | lỏng lẻo","slow | sluggish | dull | lax","1214520"),
    ("肝要","かんよう","adj-na|n","tối quan trọng | thiết yếu | cốt yếu | trọng yếu","extremely important | essential | vital","1214680"),
    ("頑迷","がんめい","adj-na|n","cố chấp | ngoan cố | bảo thủ mù quáng | cứng đầu","bigoted | obstinate | stubborn | pigheaded","1217710"),
    ("危急","ききゅう","n","nguy cấp | khẩn cấp | hiểm nguy cận kề | nguy nan","emergency | crisis | imminent danger","1218520"),
    ("詰問","きつもん","n|vs|vt","gặng hỏi | chất vấn | tra hỏi | đòi giải thích","cross-examination | close questioning","1226570"),
    ("窮乏","きゅうぼう","n|vs|vi","bần cùng | túng quẫn | nghèo khó | thiếu thốn","poverty | destitution | privation","1230120"),
    ("驚嘆","きょうたん","n|vs|vi","kinh ngạc | thán phục | trầm trồ | sửng sốt","wonder | admiration | being struck with admiration","1238720"),
    ("緊密","きんみつ","adj-na|n","chặt chẽ | mật thiết | khăng khít | gắn bó","close | compact | tightly knit","1241910"),
    ("形勢","けいせい","n","cục diện | tình thế | tình hình | thế cuộc","condition | situation | prospects","1250350"),
    ("懸命","けんめい","adj-na|n","hết mình | hết sức | tận lực | dốc sức","eager | earnest | strenuous | with utmost effort","1257730"),
    ("倦怠","けんたい","n|vs|vi","uể oải | rã rời | chán chường | mệt mỏi (倦怠期)","weariness | fatigue | languor | boredom | ennui","1256050"),
    ("拘泥","こうでい","n|vs|vi","câu nệ | quá chấp nê | cố chấp | bận tâm thái quá","adhering to | being a stickler for | being particular about","1279030"),
    ("殺伐","さつばつ","adj-t|adv-to|adj-na","sát khí | hung bạo | đầy bạo lực | lạnh lùng tàn nhẫn","brutal (atmosphere) | savage | violent | bloodthirsty","1299200"),
    ("作為","さくい","n|vs|vi","sự cố ý | dàn dựng | tạo dựng giả | hành vi cố ý","artificiality | pretence | contrived act","1297500"),
    ("暫時","ざんじ","n|adv|adj-no","tạm thời | trong chốc lát | một lúc","short while","1304440"),
    ("思案","しあん","n|vs|vt","suy tính | cân nhắc | trầm tư | đắn đo","careful thought | consideration | deliberation","1309480"),
    ("自在","じざい","n|adj-na|adj-no","tự do | tùy ý | thoải mái | linh hoạt","being able to do as one pleases | doing at will","1317750"),
    ("失脚","しっきゃく","n|vs|vi","mất chức | mất quyền | thất thế | sụp đổ (địa vị)","losing one's position | downfall | fall from power","1319850"),
    ("老舗","しにせ","n","cửa hàng lâu đời | tiệm truyền thống | thương hiệu kỳ cựu","long-established shop | shop of long standing","1585290"),
    ("趣向","しゅこう","n","ý tưởng | sáng kiến | thiết kế | gu thẩm mỹ","plan | idea | design | taste","1328970"),
    ("出没","しゅつぼつ","n|vs|vi","xuất hiện thường xuyên | thoắt ẩn thoắt hiện | lảng vảng","making frequent appearances | appearing and disappearing","1340330"),
    ("峻別","しゅんべつ","n|vs|vt","phân biệt rạch ròi | tách bạch nghiêm ngặt","rigorous distinction","1340990"),
    ("順応","じゅんのう","n|vs|vi","thích nghi | thích ứng | hòa nhập | làm quen","adaptation | accommodation | adjustment","1342280"),
    ("詳述","しょうじゅつ","n|vs|vt","trình bày chi tiết | giải thích tường tận","detailed explanation","1351780"),
    ("真摯","しんし","adj-na|n","chân thành | nghiêm túc | thành khẩn","sincere | earnest | serious","1364420"),
    ("辛辣","しんらつ","adj-na|n","gay gắt | cay nghiệt | chua cay | sâu cay (chỉ trích)","bitter (criticism) | sharp | biting | scathing","1365950"),
    ("崇高","すうこう","adj-na|n","cao cả | cao thượng | siêu phàm | tôn nghiêm","lofty | sublime | noble","1372860"),
    ("是が非でも","ぜがひでも","exp|adv","bằng mọi giá | nhất định | dù thế nào đi nữa","by all possible means | at all costs | no matter what","1374500"),
    ("切迫","せっぱく","n|vs|vi","cấp bách | căng thẳng | dồn dập | cận kề","pressure | urgency | tension | imminence","1385160"),
    ("壮健","そうけん","adj-na|n","khỏe mạnh | tráng kiện | cường tráng","healthy | robust","1399370"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
