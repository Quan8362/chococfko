# -*- coding: utf-8 -*-
"""Build N1 ready wave 036 — 慣用句 + 四字熟語 (set 36)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-036.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("背筋を伸ばす","せすじをのばす","exp|v5s","ưỡn thẳng lưng | ngồi/đứng thẳng | ngẩng cao đầu | chỉnh tư thế","to straighten one's back | to hold one's head high","2260380"),
    ("是非に及ばず","ぜひにおよばず","exp","không thể tránh | đành vậy | hết cách | chuyện không thể khác","unavoidable | cannot be helped | of necessity","2118080"),
    ("栴檀","せんだん","n","cây xoan | cây đàn hương | (栴檀は双葉より芳し: tài năng lộ từ nhỏ)","chinaberry | Japanese bead tree | sandalwood","2096330"),
    ("善男善女","ぜんなんぜんにょ","n","thiện nam tín nữ | người mộ đạo | tín đồ thuần thành","pious men and women | the faithful","1394490"),
    ("糟糠の妻","そうこうのつま","exp|n","người vợ tào khang | vợ cùng chịu khổ | vợ hiền thuở hàn vi","one's devoted wife (married in poverty)","2569580"),
    ("相好","そうごう","n","nét mặt | dung mạo | vẻ mặt (相好を崩す: tươi cười)","features | facial appearance","1749010"),
    ("袖にする","そでにする","exp|vs-i","ghẻ lạnh | phớt lờ | hắt hủi | bỏ rơi","to be cold to | to ignore (someone)","2780160"),
    ("太鼓判","たいこばん","n","sự bảo đảm chắc chắn | con dấu chứng nhận | cam đoan (太鼓判を押す)","seal of approval | guarantee | endorsement","1408290"),
    ("大同団結","だいどうだんけつ","n|vs|vi","đại đoàn kết | hợp nhất | liên minh mặt trận chung | gác bất đồng","presenting a united front | merger","1785610"),
    ("高嶺の花","たかねのはな","exp|n","đóa hoa trên cao | thứ ngoài tầm với | hoa thơm khó hái | người trong mộng xa vời","a prize beyond one's reach | unattainable object","1809660"),
    ("立つ瀬","たつせ","n","thể diện | vị thế | chỗ đứng | danh dự (立つ瀬がない: khó ăn nói)","one's position | one's face | one's honour","1661380"),
    ("棚からぼた餅","たなからぼたもち","exp|n","lộc trời cho | của trên trời rơi xuống | may mắn bất ngờ | há miệng chờ sung","a sudden windfall | unexpected good luck","1985200"),
    ("他人の空似","たにんのそらに","exp|n","giống nhau tình cờ | trông giống mà không họ hàng | nét giống ngẫu nhiên","accidental resemblance","1407200"),
    ("袖の下","そでのした","n","tiền hối lộ | tiền đút lót | tiền lót tay | của đút","a bribe | money under the table","2012030"),
    ("塵芥","じんかい","n","rác rưởi | bụi bặm | đồ phế thải | thứ vô giá trị","rubbish | trash | garbage | worthless thing","1369905"),
    ("痛痒","つうよう","n","đau và ngứa | nỗi day dứt | sự bận tâm (痛痒を感じない: chẳng hề hấn)","pain and itching | mental anguish","1432830"),
    ("角隠し","つのかくし","n","khăn trùm đầu cô dâu | mũ che sừng (lễ cưới truyền thống)","bride's head-dress","1836870"),
    ("爪に火をともす","つめにひをともす","exp|v5s","sống tằn tiện | hà tiện | bóp mồm bóp miệng | tiết kiệm tới mức keo kiệt","to live very frugally | to pinch pennies","2667460"),
    ("爪の垢","つめのあか","exp|n","ghét móng tay | chút xíu | mẩu nhỏ (爪の垢を煎じて飲む: noi gương)","a tiny bit | a shred | dirt under the fingernails","2433620"),
    ("手垢","てあか","n","vết tay bẩn | dấu tay | (手垢のついた: cũ mòn, sáo rỗng)","finger marks | dirt from the hands","1327600"),
    ("手が込む","てがこむ","exp|v5m","tinh xảo | cầu kỳ | công phu | phức tạp tỉ mỉ","to be intricate | to be elaborate","2159200"),
    ("手鍋","てなべ","n","nồi có quai | nồi tay cầm (手鍋下げても: dù nghèo vẫn theo)","a pan with a handle","1699520"),
    ("出鼻","でばな","n","lúc vừa khởi đầu | mũi đất nhô ra | thời điểm vừa ra đi (出鼻をくじく)","outset | start | the moment of setting out","1580140"),
    ("手も足も出ない","てもあしもでない","exp","bó tay bó chân | hết cách xoay xở | bất lực hoàn toàn | đành chịu","cannot do a thing | being at one's wit's end","2117970"),
    ("天涯","てんがい","n","chân trời | nơi xa xôi | đất khách | góc bể chân trời","horizon | distant land | remote region","1438600"),
    ("天下分け目","てんかわけめ","adj-no","quyết định vận mệnh | một mất một còn | ngã ngũ thiên hạ | sống còn","fateful | decisive (battle)","1438520"),
    ("天罰","てんばつ","n","quả báo | trời phạt | báo ứng | đáng đời","divine punishment | nemesis | just deserts","1440180"),
    ("怒髪天を衝く","どはつてんをつく","exp|v5k","giận tím mặt | nổi trận lôi đình | tóc dựng ngược vì giận | phẫn nộ tột cùng","to boil with rage | to be infuriated","1445720"),
    ("怒涛","どとう","n|adj-no","sóng cuồn cuộn | sóng dữ | dữ dội | cuồng nộ | hỗn loạn","surging waves | turbulent | tempestuous","1898580"),
    ("飛んで火に入る","とんでひにいる","exp","tự chui đầu vào rọ | thiêu thân lao vào lửa | tự rước họa vào thân","rushing to one's doom","2871104"),
    ("無い袖は振れぬ","ないそではふれぬ","exp","không có thì lấy gì cho | lực bất tòng tâm | tay không thì chịu","you can't give what you don't have","2101500"),
    ("内助の功","ないじょのこう","exp|n","công lao của người vợ | sự trợ giúp thầm lặng của vợ | hậu phương vững chắc","a wife's behind-the-scenes support","2811590"),
    ("泣いて馬謖を斬る","ないてばしょくをきる","exp","gạt lệ chém Mã Tốc | nén tình riêng giữ kỷ cương | xử nghiêm dù đau lòng","punishing someone you value to uphold the rules","2838678"),
    ("情けが仇","なさけがあだ","exp","làm ơn mắc oán | lòng tốt bị lợi dụng | thương người hóa hại người","kindness backfires | pardon makes offenders","2418050"),
    ("名は体を表す","なはたいをあらわす","exp|v5s","danh xứng với thực | tên gọi phản ánh bản chất | đúng người đúng tên","names and natures often agree","2419810"),
    ("生兵法","なまびょうほう","n","kiến thức nửa vời | hiểu biết hời hợt | nửa thầy nửa thợ (生兵法は大怪我のもと)","a smattering of knowledge | crude tactics","1829940"),
    ("習い性となる","ならいせいとなる","exp|v5r","thói quen thành bản tính | tập riết thành quen | thói quen là bản chất thứ hai","habit is a second nature","2417850"),
    ("日常茶飯","にちじょうさはん","n","chuyện cơm bữa | việc thường ngày | chuyện thường tình","an everyday occurrence","1464210"),
    ("二の句","にのく","n","lời tiếp theo | câu nói kế (二の句が継げない: cứng họng)","the next word","1461250"),
    ("二枚目","にまいめ","n","trai đẹp | mỹ nam | kép đẹp | vai kép đào hoa","a handsome man | a leading man","1463210"),
    ("糠に釘","ぬかにくぎ","exp|n","như đấm vào bị bông | công cốc | vô tác dụng | nước đổ lá khoai","having no effect | a waste of effort","2727590"),
    ("盗人の昼寝","ぬすびとのひるね","exp","mọi việc đều có lý do | giấc ngủ trưa của kẻ trộm (để đêm hành sự)","there's a reason behind every action","2844714"),
    ("猫も杓子も","ねこもしゃくしも","exp","bất kể ai | thượng vàng hạ cám | ai ai cũng | tất tần tật","every Tom, Dick and Harry | anyone and everyone","2105480"),
    ("寝首をかく","ねくびをかく","exp|v5k","ám sát lúc ngủ | chơi xấu sau lưng | hạ thủ kẻ mất cảnh giác | đâm lén","to assassinate someone in their sleep | to catch off guard","2118410"),
    ("寝耳","ねみみ","n","nghe lúc đang ngủ (寝耳に水: tin sét đánh ngang tai)","something heard while sleeping","2011510"),
    ("音に聞く","おとにきく","exp|v5k","nổi tiếng | lừng danh | nghe danh đã lâu | vang danh","to be widely known | to be famous","1862700"),
    ("喉元","のどもと","n","cổ họng | yết hầu | điểm trọng yếu (喉元過ぎれば)","the throat | an important part","1677720"),
    ("歯車が狂う","はぐるまがくるう","exp|v5u","trục trặc | sai lệch | hỏng bánh răng | mọi thứ rối tung","to go awry | to go off track","2848978"),
    ("裸の付き合い","はだかのつきあい","exp|n","quan hệ chân thành cởi mở | thân tình không giấu giếm | tắm trần cùng nhau","a completely honest relationship","2835959"),
    ("肌身離さず","はだみはなさず","adv|exp","luôn mang bên mình | không rời nửa bước | giữ khư khư bên người","carrying close to one's person | next to the skin","1476490"),
    ("八面六臂","はちめんろっぴ","n","ba đầu sáu tay | tài giỏi mọi mặt | đa năng | hoạt động khắp nơi","competent in all fields | versatile | all-round","1477080"),
    ("鼻持ちならぬ","はなもちならぬ","adj-pn","không chịu nổi | chướng tai gai mắt | đáng ghét | phát ngấy","intolerable | disgusting","1487010"),
    ("歯の根が合わない","はのねがあわない","exp|adj-i","run cầm cập | lập cập (vì lạnh/sợ) | run lập bập","shivering with cold or fear","2868474"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
