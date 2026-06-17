# -*- coding: utf-8 -*-
"""Build N1 ready wave 070 — compounds about speech/relations (set 70)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-070.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("茶飲み友達","ちゃのみともだち","n","bạn trà nước | bạn già tâm giao | bạn lúc về già | bạn tâm tình tuổi xế chiều","a tea-drinking companion | a crony","1711590"),
    ("飲み友達","のみともだち","n","bạn nhậu | chiến hữu trên bàn nhậu | bạn rượu","a drinking buddy","2837978"),
    ("腐れ縁","くされえん","n","mối duyên nợ dai dẳng | quan hệ khó dứt | nợ đời gắn bó | duyên ác nghiệt","an inseparable (undesirable) relationship","1497820"),
    ("顔見知り","かおみしり","n","người quen mặt | chỗ quen biết | người biết mặt nhau","an acquaintance","1614360"),
    ("取り持ち","とりもち","n","sự làm mai mối | sự dàn xếp | sự tiếp đãi | việc trung gian | mối lái","mediation | a go-between | entertainment","1707700"),
    ("仲人口","なこうどぐち","n","lời nói tốt của bà mối | lời tâng bốc giúp se duyên | lời mai mối","a matchmaker's flattering words","1425970"),
    ("口利き","くちきき","n","sự dàn xếp | người môi giới | người có ảnh hưởng | tài ăn nói | sự can thiệp","mediation | an influential person | eloquence","1276980"),
    ("顔つなぎ","かおつなぎ","n|vs|vi","sự giữ liên lạc | việc làm quen giới thiệu | duy trì quan hệ | ra mắt giao tiếp","maintaining contact | introducing people","1756230"),
    ("密談","みつだん","n|vs|vt|vi","mật đàm | bàn bạc kín | trao đổi riêng tư | nói chuyện bí mật","a private, confidential talk","1731620"),
    ("内緒話","ないしょばなし","n","chuyện riêng tư | chuyện thầm kín | lời thì thầm bí mật | chuyện kín","a secret talk","1458470"),
    ("打ち明け話","うちあけばなし","n","lời thổ lộ | chuyện tâm sự thật lòng | lời bộc bạch | tâm tình thành thật","a confession | a frank, confidential talk","1776580"),
    ("昔話","むかしばなし","n","chuyện cổ tích | chuyện xưa | chuyện ngày xưa | hồi tưởng | chuyện hoài niệm","an old tale | a folk tale | reminiscence","1382430"),
    ("長話","ながばなし","n|vs|vi","nói chuyện dài dòng | buôn chuyện lâu | tâm sự dây dưa | nói chuyện lê thê","a long talk","1430190"),
    ("無駄話","むだばなし","n|vs|vi","chuyện phiếm | tán gẫu | nói chuyện vô bổ | chuyện tầm phào | buôn dưa lê","idle talk | chit-chat | gossip","1530550"),
    ("言い募る","いいつのる","v5r|vi","tranh cãi gay gắt | lời qua tiếng lại căng thẳng | cãi vã dữ dội | cãi cố","to argue vehemently","1264300"),
    ("言いがかり","いいがかり","n","sự vu khống | cớ gây sự | kiếm chuyện | bịa đặt buộc tội | cố tình bắt bẻ","a false accusation | a pretext | picking a quarrel","1609100"),
    ("告げ口","つげぐち","n|vs|vt|vi","mách lẻo | méc | tố cáo | đâm thọc | mách lẻo sau lưng","telling on someone | tattling | snitching","1286000"),
    ("譫言","せんげん","n","lời mê sảng | nói nhảm | lời lảm nhảm vô nghĩa | nói trong cơn sốt","delirious talk | nonsense","2863240"),
    ("繰り言","くりごと","n","lời ca thán lặp đi lặp lại | than vãn dai dẳng | lời cằn nhằn | điệp khúc phàn nàn","tedious repetition | a complaint","1592440"),
    ("捨て台詞","すてぜりふ","n","lời nói móc lúc chia tay | câu đe dọa khi bỏ đi | lời cay nghiệt lúc ra về","a sharp parting remark | a parting threat","1322360"),
    ("決め台詞","きめぜりふ","n","câu nói cửa miệng | câu thoại đắt giá | câu chốt đặc trưng | câu nói thương hiệu","a signature phrase | a catchphrase","2599290"),
    ("大見得","おおみえ","n","tư thế phô trương | điệu bộ hùng hồn | dáng vẻ làm oai (大見得を切る)","a dramatic pose","1785850"),
    ("売り言葉","うりことば","n","lời khiêu khích | lời gây hấn | lời châm chọc (売り言葉に買い言葉)","fighting words | a provocative remark","1753100"),
    ("買い言葉","かいことば","n","lời đáp trả gay gắt | lời đối đáp khi bị khích | lời trả miếng","a retort (to an insult)","1752930"),
    ("殺し文句","ころしもんく","exp|n","lời nói lay động lòng người | câu nói tán tỉnh | lời đường mật chí mạng | câu chốt hạ","a clincher | a honeyed phrase | a pick-up line","1299020"),
    ("泣き落とし","なきおとし","n","mít ướt đòi hỏi | dùng nước mắt thuyết phục | chiêu khóc lóc | mè nheo bằng nước mắt","persuasion by tears | a sob story","2759810"),
    ("脅し文句","おどしもんく","n","lời đe dọa | câu hăm dọa | lời uy hiếp","threatening words","1238060"),
    ("当てこすり","あてこすり","n","lời nói bóng gió | lời châm chọc xa xôi | lời mỉa mai gián tiếp | lời ám chỉ chua cay","a snide remark | an insinuation | a sly dig","1784220"),
    ("当てつけ","あてつけ","n","lời nói cạnh khóe | hành động cố tình chọc tức | lời móc máy | sự ám chỉ trêu ngươi","something done out of spite | an insinuation","1783970"),
    ("口答え","くちごたえ","n|vs|vi","cãi lại | đáp trả xấc xược | cãi tay đôi | trả treo","a retort | back talk | backchat","1276700"),
    ("言い返し","いいかえし","n","sự đáp lại | lời đối đáp | sự cãi lại | lời phản hồi","a reply | a retort","2657300"),
    ("売り込み","うりこみ","n","sự chào hàng | quảng bá rao bán | tiếp thị | sự tự giới thiệu","sales promotion | hard selling","1473840"),
    ("触れ込み","ふれこみ","n","lời quảng cáo (phóng đại) | sự tự nhận | lời rao | tự xưng là","professing (exaggeratedly) to be | a billing","1652930"),
    ("鳴り物入り","なりものいり","n","rầm rộ | phô trương ầm ĩ | đình đám | khua chiêng gióng trống","with a fanfare | with much fanfare","1899480"),
    ("前評判","まえひょうばん","n","dư luận trước sự kiện | tiếng tăm trước khi ra mắt | sự kỳ vọng trước | đánh giá ban đầu","advance reputation | pre-event buzz","2526070"),
    ("受け売り","うけうり","n|vs|vt","nói theo người khác | học mót rồi nói lại | nhai lại lời người | bắt chước ý kiến","parroting | repeating someone else's words","1329680"),
    ("聞き上手","ききじょうず","n|adj-na","người khéo lắng nghe | người biết nghe chuyện | người giỏi tiếp chuyện","being a good listener","1823250"),
    ("話し上手","はなしじょうず","n|adj-na","người khéo ăn nói | người giỏi trò chuyện | tài ăn nói | hoạt ngôn","being a good talker | a conversationalist","1782900"),
    ("口下手","くちべた","adj-na|n","vụng ăn nói | kém giao tiếp | lúng túng khi nói | ăn nói vụng về","inarticulate | clumsy with words","1275840"),
    ("口巧者","くちごうしゃ","adj-na|n","khéo mồm | dẻo miệng | nói năng trơn tru | lém lỉnh","smooth-spoken | glib","1276100"),
    ("訥弁","とつべん","adj-na|adj-no|n","nói lắp bắp | ăn nói chậm chạp | vụng về khi nói | nói năng lúng búng","slowness of speech | awkward speech","1572620"),
    ("多弁","たべん","n|adj-na|adj-no","lắm lời | nói nhiều | ba hoa | bẻm mép","talkativeness | loquacity","1408020"),
    ("箴言","しんげん","n","châm ngôn | cách ngôn | lời răn | sách Châm Ngôn (Kinh Thánh)","a proverb | a maxim | an aphorism","1570290"),
    ("金言","きんげん","n|adj-no","kim ngôn | lời vàng | châm ngôn quý báu | lời hay ý đẹp","a wise saying | a maxim","1242840"),
    ("格言","かくげん","n|adj-no","cách ngôn | tục ngữ | châm ngôn | ngạn ngữ","a saying | a maxim | a proverb","1205300"),
    ("名言","めいげん","n","danh ngôn | câu nói nổi tiếng | lời hay ý đẹp | lời nói thâm thúy","a famous saying | a wise remark","1531450"),
    ("雑言","ぞうごん","n|vs|vi","lời chửi rủa | lời lẽ thô tục | mắng nhiếc | nói lời xúc phạm (悪口雑言)","abusive language | foul language","1299390"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
