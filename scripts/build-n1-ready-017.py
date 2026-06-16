# -*- coding: utf-8 -*-
"""Build N1 ready wave 017 — rare onomatopoeia / mimetic adverbs (set 17)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-017.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("いそいそ","いそいそ","adv-to|adv|vs","hớn hở | hồ hởi | hân hoan | náo nức","cheerfully | joyfully | eagerly","1000820"),
    ("うかうか","うかうか","adv|adv-to|vs","lơ đãng | bất cẩn | lơ là | vô tâm","carelessly | inattentively","2121190"),
    ("うずうず","うずうず","adv|adv-to|vs","ngứa ngáy muốn làm | nôn nóng | rạo rực | sốt ruột","itching to do something | impatient | eager","1000980"),
    ("おめおめ","おめおめ","adv-to|adv","trơ trẽn | mặt dày | nhục nhã mà vẫn | cam chịu hổ thẹn","shamelessly | brazenly | resigned to disgrace","2068340"),
    ("がさがさ","がさがさ","adv|adv-to|vs|adj-na|adj-no|n","sột soạt | khô ráp | thô nhám | xù xì","rustling | dry | rough to the touch | coarse","1003090"),
    ("ぎこちない","ぎこちない","adj-i","vụng về | lóng ngóng | gượng gạo | cứng nhắc","awkward | clumsy | stiff | constrained","1003550"),
    ("ぐうたら","ぐうたら","n|adj-na","lười biếng | đồ vô tích sự | kẻ lười nhác | biếng nhác","lazybones | good-for-nothing | idler","2007910"),
    ("こせこせ","こせこせ","adv|adv-to|vs","bồn chồn | xét nét | chi li vặt vãnh | tù túng","restlessly | fussily | making a fuss over trifles","1004400"),
    ("さめざめ","さめざめ","adv-to|adv","sụt sùi | thút thít | khóc rưng rức | nức nở thầm","weeping quietly | crying bitterly","1005270"),
    ("しくしく","しくしく","adv|adv-to|vs","thút thít | sụt sịt | đau âm ỉ | rấm rứt","sobbing softly | (pain) griping dully","2121270"),
    ("しどろもどろ","しどろもどろ","adj-no|adj-na","lắp ba lắp bắp | ấp a ấp úng | lộn xộn | rối loạn","confused | faltering | incoherent","2076670"),
    ("すたすた","すたすた","adv-to","thoăn thoắt | rảo bước | đi nhanh thoăn thoắt","walking briskly | at a brisk pace","1006090"),
    ("ずるずる","ずるずる","adv|adv-to|adj-na","lê thê | dây dưa | kéo lê | trượt dần | lằng nhằng","dragging slowly | on and on | slovenly | inconclusive","1006440"),
    ("そそくさ","そそくさ","adv-to|adv|vs","vội vã | hấp tấp | tất tả | vội vàng","hurriedly | hastily | in haste","2056010"),
    ("たじたじ","たじたじ","adv|adv-to|vs","chùn bước | nao núng | lùi bước | luống cuống","flinchingly | being overwhelmed | staggeringly","1007210"),
    ("ちぐはぐ","ちぐはぐ","adj-na|n","lệch lạc | so le | khập khiễng | không ăn khớp | lủng củng","mismatched | inconsistent | incoherent","1007540"),
    ("ちまちま","ちまちま","adv-to|adv","nhỏ nhắn | gọn gàng | nhỏ xinh | li ti","small | compact | tiny and tidy","2067570"),
    ("つべこべ","つべこべ","adv|adv-to","lý sự | cãi nhằng | bắt bẻ | càu nhàu vặt vãnh","complaining | nitpicking","1008170"),
    ("とぼとぼ","とぼとぼ","adv|adv-to","lủi thủi | lê bước | thất thểu | nặng nề chậm chạp","trudging along | plodding | with heavy steps","1008700"),
    ("どぎまぎ","どぎまぎ","vs|adv|adv-to","luống cuống | bối rối | lúng túng | hồi hộp ngượng ngùng","flustered | upset | nervous | embarrassed","2009200"),
    ("どんより","どんより","adv|adv-to|vs","u ám | xám xịt | đục ngầu | đờ đẫn | lờ đờ","dark | gloomy | overcast | dull | glazed","2009280"),
    ("なよなよ","なよなよ","adv-to|adv|vs","ẻo lả | mảnh mai yếu ớt | mềm mại | yếu đuối","delicately | weakly | gently | supplely","1009460"),
    ("のうのう","のうのう","adv-to|vs","ung dung | thảnh thơi | vô tư lự | thư thái","carefree | relaxed | at one's ease","2079000"),
    ("のべつ","のべつ","adv","liên tục | không ngừng | suốt | liên miên","ceaselessly | continually | incessantly","2093140"),
    ("のらりくらり","のらりくらり","adv|adv-to|vs","lờ vờ | uể oải | vòng vo né tránh | lươn lẹo trốn tránh","idly | aimlessly | evasively | non-committally","2009380"),
    ("ひょっこり","ひょっこり","adv|adv-to","bất thình lình | thình lình xuất hiện | tình cờ | đột ngột","all of a sudden | suddenly | unexpectedly","1010630"),
    ("ぼやぼや","ぼやぼや","vs|adv|adv-to|adj-na","lơ đãng | đãng trí | lờ đờ | chậm chạp lơ là","careless | inattentive | absentminded | slow","1124270"),
    ("まじまじ","まじまじ","adv|adv-to","chăm chăm | đăm đăm | nhìn không chớp mắt | trừng trừng","staringly | fixedly | unblinkingly","2261260"),
    ("むしゃくしゃ","むしゃくしゃ","adv|adv-to|vs","bực bội | cáu kỉnh | bứt rứt | khó chịu trong người","vexed | irritated | fretful | in ill humour","1632680"),
    ("むんむん","むんむん","adv|adv-to|vs","ngột ngạt | oi bức | hầm hập | nóng nực","stuffy | steamy | sultry","1012420"),
    ("もたもた","もたもた","adv|adv-to|vs","lề mề | chậm chạp | lóng ngóng | rề rà","slowly | inefficiently | tardily | dawdling","1012600"),
    ("もやもや","もやもや","adv|adv-to|vs|n","mơ hồ | mù mờ | bứt rứt | u uất khó tả | day dứt","hazy | murky | uncertain feeling | pent-up feelings","1012690"),
    ("よぼよぼ","よぼよぼ","adj-no|adj-na|vs|adv|adv-to","run rẩy | lọm khọm | già yếu | lập cập | còm cõi","doddering | tottering | decrepit | frail","1013180"),
    ("わなわな","わなわな","adv|adv-to|vs","run lẩy bẩy | run rẩy (vì sợ) | run cầm cập","trembling from fear | trembling all over","2086520"),
    ("うつらうつら","うつらうつら","adv|adv-to|vs","lơ mơ | gà gật | chập chờn buồn ngủ | thiu thiu","drowsily | nodding off","2038330"),
    ("ぎゅうぎゅう","ぎゅうぎゅう","adv|adv-to|adj-na|adj-no","chật ních | nhồi nhét | siết chặt | dồn ép gắt gao","packing in tightly | cramming | tightly | going hard on someone","1003600"),
    ("こそこそ","こそこそ","adv|adv-to|vs","lén lút | thậm thụt | vụng trộm | giấu giếm","sneakily | secretly | stealthily | on the sly","1004420"),
    ("しゃきしゃき","しゃきしゃき","adv|adv-to|vs","giòn rụm | sần sật | dứt khoát | nhanh gọn lẹ","crisp | crunchy | precise | brisk","1005640"),
    ("すやすや","すやすや","adv|adv-to","say giấc | ngủ ngon lành | ngủ êm | ngủ yên bình","sleeping peacefully | soundly","1006230"),
    ("ぴんぴん","ぴんぴん","adv|adv-to|vs","khỏe re | sung sức | tràn đầy sức sống | nhảy tanh tách","lively | energetic | full of life | vigorously","1010960"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
