# -*- coding: utf-8 -*-
"""Build N1 ready wave 039 — 慣用句 + 四字熟語 + nouns (set 39)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-039.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("押しも押されもせぬ","おしもおされもせぬ","exp|adj-f","danh tiếng lừng lẫy | uy tín vững vàng | được công nhận rộng rãi | tên tuổi đã được khẳng định","of established reputation | universally recognized","1862420"),
    ("お釈迦","おしゃか","n","đồ hỏng | hàng lỗi | phế phẩm | làm hỏng (お釈迦になる)","a defective article | a poorly made product","1694630"),
    ("お調子者","おちょうしもの","n","kẻ dễ phổng mũi | người a dua | kẻ hay được đà | đứng núi này trông núi nọ","a person who gets carried away easily","1694860"),
    ("鬼の霍乱","おにのかくらん","exp|n","người khỏe bỗng đổ bệnh | hổ cũng có lúc ốm | kẻ cường tráng bất ngờ ngã bệnh","a healthy person unexpectedly falling ill","2723180"),
    ("思う壺","おもうつぼ","n","đúng như tính toán | trúng kế | đúng ý đồ | sa vào bẫy","just as planned | falling into one's trap","1825770"),
    ("親方","おやかた","n","ông chủ | đốc công | sư phụ | thầy cả | cha mẹ nuôi","master | boss | foreman | stable master","1365360"),
    ("親の七光り","おやのななひかり","exp|n","nhờ ơn cha mẹ | dựa hơi cha mẹ | hưởng phúc ấm gia đình | thơm lây","benefiting from a parent's fame or influence","1365080"),
    ("親不孝","おやふこう","n|vs|vi|adj-na","bất hiếu | không hiếu thảo | cãi lời cha mẹ | đứa con bất hiếu","lack of filial piety | being disobedient to parents","1365320"),
    ("恩を仇で返す","おんをあだでかえす","exp|v5s","ăn cháo đá bát | lấy oán trả ơn | vong ân bội nghĩa | trả ơn bằng thù","to return evil for good | to bite the hand that feeds","1183110"),
    ("快刀乱麻を断つ","かいとうらんまをたつ","exp|v5t","chặt đứt mớ bòng bong | giải quyết gọn ghẽ | xử lý nhanh khéo việc rối","to cut the Gordian knot","1976490"),
    ("垣間見る","かいまみる","v1|vt","thoáng thấy | nhìn trộm | hé nhìn | thấy phần nào","to catch a glimpse of | to take a peep at","1204790"),
    ("駆け落ち","かけおち","n|vs|vi","bỏ trốn theo người yêu | trốn nhà theo tình | tư bôn | bỏ trốn cùng nhau","elopement | running away with a lover","1590050"),
    ("陰口","かげぐち","n|adj-no","nói xấu sau lưng | đâm thọc | đặt điều | gièm pha lén","backbiting | malicious gossip behind one's back","1170340"),
    ("影法師","かげぼうし","n","bóng người | hình bóng | cái bóng in trên tường","a shadow figure | a silhouette","1173700"),
    ("甲斐甲斐しい","かいがいしい","adj-i","tận tụy | chu đáo tháo vát | chăm chỉ | hết lòng | nhanh nhẹn đảm đang","diligent | devoted | brisk and efficient","1280260"),
    ("門出","かどで","n|vs|vi","lên đường | khởi hành | bước vào đời mới | khởi đầu mới | xuất phát","setting off | departure | starting a new life","1636020"),
    ("体たらく","ていたらく","n","tình cảnh thảm hại | bộ dạng be bét | nông nỗi (khó coi) | cảnh tượng tệ hại","an unpleasant state of affairs | a sorry mess","1157320"),
    ("我を張る","がをはる","exp|v5r","khăng khăng giữ ý | cố chấp | bảo thủ | cứng đầu giữ ý mình","to insist on one's own ideas | to be stubborn","1196760"),
    ("眼中にない","がんちゅうにない","exp|adj-i","không thèm để ý | coi như không tồn tại | chẳng đếm xỉa | phớt lờ","taking no notice of | disregarding completely","1217220"),
    ("看板倒れ","かんばんだおれ","n","hữu danh vô thực | treo đầu dê bán thịt chó | hình thức suông | phô trương rỗng","ostentatious | impressive in name only","1214010"),
    ("聞き耳","ききみみ","n","dỏng tai nghe | căng tai nghe ngóng (聞き耳を立てる)","straining one's ears (to listen)","1823320"),
    ("利き腕","ききうで","n","tay thuận | cánh tay thuận | tay hay dùng","one's dominant arm","1758410"),
    ("傷口に塩","きずぐちにしお","exp","xát muối vào vết thương | khoét sâu nỗi đau | đã đau còn đau thêm","rubbing salt in the wound","2853761"),
    ("気っ風","きっぷ","n","tính cách | khí chất | tâm tính | bản lĩnh hào sảng","character | disposition | spirit","1791040"),
    ("昨日の今日","きのうのきょう","exp","vừa mới hôm qua | chuyện còn nóng hổi | ngay sau hôm qua | mới đó mà","right on the heels of yesterday | only yesterday","2117920"),
    ("鬼面","きめん","n","mặt quỷ | vẻ ngoài dọa người | bộ mặt hung tợn (鬼面人を脅す: dọa suông)","a devil's mask | a startling appearance","1614580"),
    ("窮余の一策","きゅうよのいっさく","exp|n","kế cùng | nước cờ liều cuối | biện pháp tuyệt vọng | kế chót","a desperate measure | a last-ditch effort","2113750"),
    ("切り口上","きりこうじょう","n","lời lẽ cứng nhắc | giọng điệu khách sáo | cách nói trịnh trọng máy móc","stiff formality | set formal terms","1384100"),
    ("気を吐く","きをはく","exp|v5k","thể hiện khí thế | trổ tài gây ấn tượng | làm rạng danh | tỏ rõ bản lĩnh","to make a good showing | to be in high spirits","2516380"),
    ("くだを巻く","くだをまく","exp|v5k","say rượu lảm nhảm | nói nhảm khi say | càu nhàu lè nhè","to babble drunkenly | to ramble in one's cups","1872080"),
    ("口先だけ","くちさきだけ","exp|adj-no","chỉ nói suông | nói cho có | đầu môi chót lưỡi | sáo rỗng","all talk | insincere | empty words","2588150"),
    ("口を挟む","くちをはさむ","exp|v5m","chen lời | nói leo | xen vào | cắt ngang câu chuyện","to cut into a conversation | to interject","1872190"),
    ("首実検","くびじっけん","n|vs|vi","nhận diện | đối chất xác minh | kiểm tra danh tính nghi phạm","identification (of a suspect) | checking someone's identity","1696750"),
    ("工夫を凝らす","くふうをこらす","exp|v5s","vắt óc nghĩ cách | dày công sáng tạo | nghĩ ra diệu kế | sáng kiến tinh xảo","to exercise one's ingenuity","1309500"),
    ("口幅ったい","くちはばったい","adj-i","nói lớn lối | huênh hoang | mạnh miệng quá đáng | nói càn","boastful | conceited | impudent","1678250"),
    ("玄人はだし","くろうとはだし","n|adj-no","giỏi hơn cả chuyên gia | làm thầy phải nể | nghiệp dư mà hơn nhà nghề","outdoing a professional | putting an expert to shame","2082630"),
    ("血気盛ん","けっきさかん","adj-na","máu nóng | sung sức | hăng hái nhiệt huyết | bừng bừng khí thế","passionate | hot-blooded | full of vitality","2836765"),
    ("言質を取る","げんちをとる","exp|v5r","lấy lời cam kết | nắm lời hứa | buộc hứa hẹn | có bằng chứng lời nói","to get a commitment | to exact a promise","2870463"),
    ("業突く張り","ごうつくばり","adj-na|n","cứng đầu cố chấp | bướng bỉnh keo kiệt | kẻ ngoan cố | đồ keo kiệt","stubbornness | a pigheaded miser","1239490"),
    ("極楽とんぼ","ごくらくとんぼ","n","kẻ vô lo vô nghĩ | người hời hợt vô tư | tính tình lông bông | sống thờ ơ","a happy-go-lucky, easygoing person","2030590"),
    ("こけら落とし","こけらおとし","n","lễ khai trương rạp hát | buổi diễn ra mắt nhà hát mới","the opening of a new theater","1725730"),
    ("心得違い","こころえちがい","n","hiểu lầm | suy nghĩ sai lệch | cư xử thiếu thận trọng | nhầm lẫn","imprudence | misbehavior | misunderstanding","1793580"),
    ("腰巾着","こしぎんちゃく","n","kẻ bám đuôi | tay sai | đám tùy tùng | kẻ nịnh bợ luôn theo sát","a hanger-on | a flunky | a sycophant","1836300"),
    ("言葉尻","ことばじり","n","đuôi câu nói | chỗ hớ trong lời nói | lỡ lời (言葉尻をとらえる: bắt bẻ)","the end of one's words | a slip of the tongue","1756450"),
    ("小手調べ","こてしらべ","n","thử sức ban đầu | khởi động | thử nghiệm sơ bộ | dạo đầu","a preliminary test | a tryout | a warm-up","1743480"),
    ("碁打ち","ごうち","n","người chơi cờ vây | việc đánh cờ vây","a go player | playing go","1756880"),
    ("小耳","こみみ","n","nghe loáng thoáng | tình cờ nghe được (小耳に挟む)","overhearing | happening to hear","1348230"),
    ("紺屋","こうや","n","thợ nhuộm | tiệm nhuộm vải (紺屋の白袴)","a dyer","1579160"),
    ("才気煥発","さいきかんぱつ","adj-na|adj-no|n","tài trí xuất chúng | thông minh lỗi lạc | sắc sảo lanh lợi | trí tuệ sáng láng","quick-witted | brilliant","1294490"),
    ("最後っ屁","さいごっぺ","n","đòn cuối tuyệt vọng | chiêu cuối liều mạng | rắm hôi của chồn (lúc nguy)","a final desperate tactic | a parting shot","2575770"),
    ("座が白ける","ざがしらける","exp|v1","cụt hứng cả buổi | làm nguội không khí | làm mất vui | tẻ ngắt","to put a damper on the gathering","2096610"),
    ("ささくれ立つ","ささくれだつ","v5t|vi","xơ ra | tướp ra | trở nên cáu kỉnh | bứt rứt khó chịu","to get frayed | to become irritable","2660470"),
    ("五月雨式","さみだれしき","n","nhỏ giọt | lai rai | rời rạc kéo dài | dây dưa từng đợt","in an intermittent manner | dragging on and on","2063500"),
    ("皿回し","さらまわし","n","trò xoay đĩa | tiết mục tung hứng đĩa | người biểu diễn xoay đĩa","plate-spinning | a plate spinner","1645240"),
    ("三十六計","さんじゅうろっけい","n","tam thập lục kế | ba mươi sáu kế (三十六計逃げるに如かず: chuồn là thượsách)","the thirty-six stratagems (of ancient China)","1300710"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
