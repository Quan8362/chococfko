# -*- coding: utf-8 -*-
"""Build N1 ready wave 090 — rare literary 漢語 (set 90)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-090.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("凄艶","せいえん","adj-na|n","đẹp ma mị | đẹp lạnh lùng quyến rũ | yêu kiều liêu trai","weirdly beautiful","1374570"),
    ("生殺","せいさつ","n|vs","quyền sinh sát | nắm sống chết | tha hay giết (生殺与奪)","sparing life and taking life","2566200"),
    ("斉唱","せいしょう","n|vs|vt","hát đồng thanh | đồng ca | hô đồng thanh | xướng cùng giọng","singing in unison","1382030"),
    ("寂寞","せきばく","adj-t|adv-to|adj-no|n","cô liêu | quạnh hiu | vắng vẻ | hiu quạnh | tịch mịch","lonely | dreary | desolate","1733850"),
    ("斥力","せきりょく","n","lực đẩy | lực xô đẩy | sức đẩy","repulsive force","1382360"),
    ("雪冤","せつえん","n|vs","sự minh oan | rửa oan | giải oan | gột rửa tiếng oan","exoneration | clearing one's name","1842460"),
    ("窃取","せっしゅ","n|vs|vt","trộm cắp | đánh cắp | ăn cắp | lấy trộm","theft | stealing","1386100"),
    ("刹那主義","せつなしゅぎ","n","chủ nghĩa sống cho hiện tại | sống gấp | sống cho khoảnh khắc trước mắt","living only for the moment","1755090"),
    ("旋毛","つむじ","n","xoáy tóc | chòm tóc xoáy | đỉnh xoáy (旋毛曲がり: cố chấp)","a hair whorl","1391710"),
    ("漸層法","ぜんそうほう","n","phép tăng tiến | lối hành văn dồn dập tăng dần | thủ pháp cao trào","gradation | climax (rhetoric)","2831213"),
    ("喘息","ぜんそく","n","bệnh hen suyễn | chứng hen | hen phế quản","asthma","1565360"),
    ("糟粕","そうはく","n","bã rượu | cặn bã | cái thừa thãi vô giá trị","sake lees | dregs","2703360"),
    ("漱石枕流","そうせきちんりゅう","n","cố chấp ngụy biện | thua mà không nhận | ngoan cố cãi bừa | bảo thủ chống chế","stubbornly refusing to admit being wrong","2033270"),
    ("蹌踉","そうろう","adj-t|adv-to","loạng choạng | lảo đảo | xiêu vẹo | lảo đảo nghiêng ngả","tottering | staggering | reeling","2573240"),
    ("俗悪","ぞくあく","adj-na|n","thô tục | dung tục | hạ cấp | kệch cỡm | tầm thường thấp kém","vulgar | coarse | lowbrow","1405140"),
    ("頽唐","たいとう","n","suy đồi | sa sút | tàn lụi | suy tàn đồi bại","decadence | decline","1854320"),
    ("退嬰的","たいえいてき","adj-na","bảo thủ | thụt lùi | trì trệ | không tiến thủ | rụt rè lùi bước","conservative | regressive | unenterprising","1411310"),
    ("惰気","だき","n","sự uể oải | sự lười nhác | tính bê trễ | sự lờ đờ","indolence | listlessness","1408560"),
    ("蛇蝎","だかつ","n","rắn rết | thứ đáng ghê tởm | điều kinh tởm | căm ghét (蛇蝎視)","snakes and scorpions | something detestable","1753510"),
    ("忸怩","じくじ","adj-t|adv-to","hổ thẹn | ngượng ngùng | xấu hổ | thẹn thùng (内心忸怩)","bashful | ashamed","1566750"),
    ("湛然","たんぜん","adj-no|adj-t|adv-to","tĩnh lặng đầy nước | yên tĩnh bất động | tĩnh tại sâu lắng","still and full of water | quiet and unmoving","2842278"),
    ("耽美主義","たんびしゅぎ","n","chủ nghĩa duy mỹ | chủ nghĩa thẩm mỹ | tôn sùng cái đẹp","aestheticism","1768700"),
    ("箪食瓢飲","たんしひょういん","n","cơm hẩm nước lã | sống đạm bạc thanh bần | bằng lòng với cuộc sống thanh đạm","being content with a frugal life","2842979"),
    ("遅疑","ちぎ","n|vs|vi","do dự | chần chừ | lưỡng lự | ngần ngại","hesitation | vacillation","1616540"),
    ("逐鹿","ちくろく","n","tranh giành quyền lực | cuộc đua tranh ngôi | tranh đoạt địa vị (中原逐鹿)","a contest for power","2864961"),
    ("畜生道","ちくしょうどう","n","súc sinh đạo | cõi súc sinh | hành vi thú tính | việc loạn luân vô đạo","the animal realm | an indefensible act","1422220"),
    ("治乱興亡","ちらんこうぼう","n","trị loạn hưng vong | thịnh suy của quốc gia | thời bình loạn lên xuống","a nation's rise and fall, peace and turmoil","2031140"),
    ("紐帯","ちゅうたい","n","sợi dây gắn kết | mối liên kết | nhịp cầu nối | mối ràng buộc quan trọng","a tie | a social bond | a link","1487980"),
    ("寵幸","ちょうこう","n","sự sủng ái | ơn sủng | ân sủng | sự yêu chiều","favour | grace","1893840"),
    ("凋尽","ちょうじん","n","héo tàn | suy tàn | lụi tàn | tàn lụi","withering | decay","1427480"),
    ("寵姫","ちょうき","n","ái phi | sủng cơ | người thiếp được sủng ái | nàng được yêu chiều","one's favorite mistress","1893820"),
    ("彫心鏤骨","ちょうしんるこつ","n|vs|vi","khắc cốt ghi tâm dồn công | dày công gọt giũa | lao tâm khổ tứ trau chuốt (tác phẩm)","painstakingly polishing a work","1428060"),
    ("鳥瞰","ちょうかん","n|vs|vt","nhìn từ trên cao | toàn cảnh | góc nhìn bao quát | tầm nhìn chim bay","a bird's-eye view","1430340"),
    ("跳梁跋扈","ちょうりょうばっこ","n|vs","hoành hành ngang ngược | lộng hành tác oai | tung hoành ngang dọc","running rampant | domination","1429720"),
    ("直截","ちょくせつ","adj-na|n","thẳng thắn | dứt khoát | bộc trực | rõ ràng | quyết đoán mau lẹ","direct | straightforward | decisive","1431640"),
    ("沈鬱","ちんうつ","adj-na|n","u uất | trầm uất | buồn rầu ảm đạm | sầu muộn","melancholy | gloom | depression","1768600"),
    ("鎮撫","ちんぶ","n|vs|vt","trấn an | vỗ về | dẹp yên | xoa dịu | bình định","pacification | placating","1705180"),
    ("痛罵","つうば","n|vs|vt","mắng nhiếc thậm tệ | chỉ trích kịch liệt | đả kích gay gắt | lăng mạ","abuse | invective | sharp criticism","1687650"),
    ("通有","つうゆう","adj-na|n","đặc tính chung | tính phổ biến | điểm chung | nét chung (通有性)","commonality","1687150"),
    ("韜晦趣味","とうかいしゅみ","n","thú giấu mình | tính hay che giấu tài năng | thích ẩn danh khiêm nhường","propensity to efface oneself","2050810"),
    ("党同伐異","とうどうばつい","n","kéo bè kết phái | phe ta đánh phe người | bè đảng công kích | óc bè phái","narrow partisanship","2843235"),
    ("桐油","とうゆ","n","dầu trẩu | dầu cây ngô đồng | dầu sơn ta","tung oil","1240720"),
    ("蟷螂","かまきり","n","bọ ngựa | con ngựa trời | con bọ ngựa","a praying mantis","1585940"),
    ("蕩尽","とうじん","n|vs|vt","tiêu xài hết sạch | phung phí cạn kiệt | nướng sạch | tán gia bại sản","squandering | dissipation","1619770"),
    ("韜略","とうりゃく","n","binh thư mưu lược | sách lược | mưu lược dụng binh","strategy | tactics","1574250"),
    ("頓狂","とんきょう","adj-na|n","ngớ ngẩn | hớ hênh bất ngờ | lố bịch | thất thanh (sửng sốt) (素っ頓狂)","wild | freakish | crazy","1713310"),
    ("鈍麻","どんま","n|vs|vi","tê liệt | trơ lì | chai sạn cảm giác | mất nhạy bén","becoming numb | becoming desensitized","1457670"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
