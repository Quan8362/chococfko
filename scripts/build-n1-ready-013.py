# -*- coding: utf-8 -*-
"""Build N1 ready wave 013 — personality/emotion/psychology terms (set 13)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-013.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("陰鬱","いんうつ","adj-na|n","u uất | ảm đạm | rầu rĩ | âm u | buồn bã","gloomy | melancholy | dreary | dismal","1170550"),
    ("鷹揚","おうよう","adj-na|n","khoan thai | hào phóng | điềm đạm | ung dung độ lượng","large-hearted | generous | magnanimous | composed","1608970"),
    ("非情","ひじょう","adj-na|adj-no|n","lạnh lùng | nhẫn tâm | vô cảm | vô tri (vật)","cold-hearted | callous | unfeeling | insentient","1485030"),
    ("酷薄","こくはく","adj-na|n","tàn nhẫn | vô nhân đạo | bạc bẽo | nhẫn tâm","cruel | inhumane | callous | brutal","1593160"),
    ("残忍","ざんにん","adj-na|n","tàn nhẫn | tàn bạo | nhẫn tâm | máu lạnh","brutal | cruel | merciless | cold-blooded","1304670"),
    ("姑息","こそく","adj-na|n","đối phó | tạm bợ | chắp vá | thủ đoạn lén lút","underhanded | makeshift | stopgap","1266780"),
    ("卑劣","ひれつ","adj-na|n","hèn hạ | đê tiện | bỉ ổi | hèn nhát","mean | contemptible | despicable | cowardly","1482820"),
    ("下劣","げれつ","adj-na|n","đê hèn | thấp hèn | thô tục | hạ đẳng","base | mean | vulgar | despicable","1186590"),
    ("強欲","ごうよく","adj-na|n","tham lam | tham ăn | tham lam vô độ","greedy | avaricious | rapacious | insatiable","1236590"),
    ("吝嗇","りんしょく","n|adj-na","keo kiệt | bủn xỉn | hà tiện | ki bo","stinginess | miserliness | parsimony","1585670"),
    ("慎ましい","つつましい","adj-i","khiêm tốn | nhún nhường | giản dị | dè dặt","modest | reserved | humble | frugal","2009010"),
    ("僭越","せんえつ","adj-na|n","tiếm việt | quá phận | mạo muội | hỗn xược","presumptuous | arrogant | audacious | insolent","1564040"),
    ("驕り","おごり","n","kiêu căng | ngạo mạn | tự cao | tự phụ","arrogance | haughtiness | conceitedness","2430480"),
    ("気高い","けだかい","adj-i","cao quý | thanh cao | cao thượng | tôn quý","sublime | noble | high-minded","1222210"),
    ("凛々しい","りりしい","adj-i","oai phong | lẫm liệt | hiên ngang | đường bệ","gallant | manly | brave | imposing | dignified","1606330"),
    ("雄々しい","おおしい","adj-i","nam tính | dũng mãnh | hào hùng | anh dũng","manly | brave | heroic","1643720"),
    ("甲斐性","かいしょう","n","khả năng tháo vát | năng lực kiếm sống | đáng tin cậy","resourcefulness | ability to earn a living","1280270"),
    ("度胸","どきょう","n","gan dạ | can đảm | bản lĩnh | dũng khí","courage | bravery | nerve | guts","1445190"),
    ("豪胆","ごうたん","adj-na|n","gan góc | táo bạo | dũng cảm phi thường | gan lì","bold | daring | dauntless | stout-hearted","1593530"),
    ("小胆","しょうたん","adj-na|n","nhút nhát | gan nhỏ | rụt rè","timidity","1744110"),
    ("怖気","おぞけ","n","sự sợ hãi | nỗi khiếp sợ | rùng mình | ớn lạnh","fear | dread | fright | willies","2075560"),
    ("怯懦","きょうだ","adj-na|n","hèn nhát | nhu nhược | yếu đuối | nhút nhát","cowardly | spineless | weak-willed","1833810"),
    ("柔弱","にゅうじゃく","adj-na|n","nhu nhược | yếu mềm | ẻo lả | nhút nhát","weak | weak-kneed | feeble | effeminate","1335420"),
    ("軟弱","なんじゃく","adj-na|n","mềm yếu | nhu nhược | dễ lung lay | suy yếu (thị trường)","soft | weak | spineless | easily swayed","1460790"),
    ("脆弱","ぜいじゃく","adj-na|n","mong manh | yếu ớt | giòn | dễ tổn thương","weak | frail | fragile","1918240"),
    ("壮快","そうかい","adj-na|n","sảng khoái | phấn chấn | hùng tráng | nức lòng","emotionally uplifting | stirring","1399350"),
    ("痛快","つうかい","adj-na|n","sảng khoái | hả hê | đã đời | thống khoái","exhilarating | thrilling | intensely pleasurable","1432750"),
    ("明朗","めいろう","adj-na","vui tươi | hoạt bát | minh bạch | trong sáng | công bằng","cheerful | bright | clear | honest | fair","1532640"),
    ("快楽","かいらく","n","khoái lạc | hưởng lạc | lạc thú | thú vui","pleasure","1199980"),
    ("享楽","きょうらく","n|vs|vt","hưởng lạc | tận hưởng | hưởng thụ vui thú","enjoyment | pleasure","1233230"),
    ("歓楽","かんらく","n","hoan lạc | vui chơi | hưởng lạc | niềm vui","pleasure | fun | enjoyment","1212930"),
    ("逸楽","いつらく","n","ăn chơi nhàn rỗi | hưởng lạc buông thả | rong chơi","idle pursuit of pleasure","1587530"),
    ("安逸","あんいつ","n|adj-na","an nhàn | nhàn hạ | ăn không ngồi rồi | thảnh thơi","idle ease | idleness | leisureliness","1608240"),
    ("耽溺","たんでき","n|vs|vi","đắm chìm | sa đọa | nghiện ngập | trụy lạc","indulgence | debauchery | dissipation","1768720"),
    ("没入","ぼつにゅう","n|vs|vi","đắm chìm | mải mê | chìm đắm | nhập tâm","being absorbed | immersion | sinking into","1522020"),
    ("精励","せいれい","n|vs|vi","chuyên cần | siêng năng | cần mẫn | nỗ lực","diligence | industry | hard work","1380220"),
    ("丹精","たんせい","n|vs|vi","dồn tâm sức | tận tâm | chăm chút | thành tâm","working earnestly | sincerity | diligence","1416940"),
    ("克己","こっき","n|vs|vi","khắc kỷ | tự chủ | kiềm chế bản thân | tự kiềm","self-control | self-mastery | self-restraint","1285760"),
    ("自制","じせい","n|vs|vt|vi","tự kiềm chế | tự chủ | tự kiểm soát","self-control | self-restraint","1318020"),
    ("自重","じちょう","n|vs|vi","tự trọng | thận trọng | giữ mình | chăm sóc sức khỏe","self-respect | prudence | restraining oneself","1317910"),
    ("自粛","じしゅく","n|vs|vt","tự kiềm chế | tự hạn chế | tự giác kiêng | tự kỷ luật","self-restraint | voluntary restraint | self-discipline","1317920"),
    ("節制","せっせい","n|vs|vt|adj-no","tiết chế | chừng mực | điều độ | kiêng khem","moderation | self-restraint | temperance","1386270"),
    ("禁欲","きんよく","n|vs|vi","tiết dục | khắc kỷ | kiêng khem | khổ hạnh","abstinence | self-denial | asceticism","1241680"),
    ("自戒","じかい","n|vs|vi","tự răn mình | tự cảnh tỉnh | tự nhắc nhở","self-admonition","1617280"),
    ("自責","じせき","n|vs|vi","tự trách | tự dằn vặt | tự lên án mình","self-condemnation | self-reproach","1318040"),
    ("慙愧","ざんき","n|vs|vi","hổ thẹn | xấu hổ | ăn năn | nhục nhã","shame | compunction | remorse","2060730"),
    ("悔恨","かいこん","n|vs|adj-no","hối hận | ăn năn | hối tiếc | sám hối","regret | remorse | repentance | contrition","1200470"),
    ("悔悟","かいご","n|vs|vt|vi","hối lỗi | ăn năn | hối cải | sám hối","remorse | repentance","1200460"),
    ("痛恨","つうこん","n|adj-no","đau xót | tiếc nuối khôn nguôi | đau buồn cay đắng","deep regret | great sorrow | bitter grief","1432770"),
    ("無念","むねん","n|adj-na|adj-no","tiếc nuối | cay đắng | uất ức | vô niệm (giải thoát)","regret | chagrin | mortification | freedom from thoughts","1530770"),
    ("怨恨","えんこん","n","oán hận | thù hằn | hiềm khích | mối thù","enmity | grudge","1176560"),
    ("憤激","ふんげき","n|vs|vi","phẫn nộ | nổi giận đùng đùng | căm phẫn | nổi cơn thịnh nộ","fury | flying into a rage | outrage","1504660"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
