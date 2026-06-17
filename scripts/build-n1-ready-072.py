# -*- coding: utf-8 -*-
"""Build N1 ready wave 072 — compound nouns (-mono, -sho, -me, etc.) (set 72)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-072.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("食わせ物","くわせもの","n","đồ giả | hàng nhái | kẻ giả mạo | kẻ lừa đảo | đồ đội lốt","a fake | a sham | an impostor","2169410"),
    ("捧げ物","ささげもの","n","lễ vật | đồ dâng cúng | vật hiến tế | đồ cống hiến","an offering | a sacrifice","1853170"),
    ("貢ぎ物","みつぎもの","n","cống vật | đồ triều cống | vật cống nạp | đồ tiến cống","tribute","1604560"),
    ("供え物","そなえもの","n","đồ cúng | lễ vật dâng cúng | vật phẩm cúng thần","an offering (to the gods)","2833270"),
    ("授かり物","さずかりもの","n","quà trời ban | của trời cho | phúc lộc ban tặng | tặng vật quý giá","a boon | a blessing | a windfall","1697940"),
    ("頂き物","いただきもの","n","quà được tặng | quà biếu | đồ được cho | tặng phẩm","a present (received) | a gift","1430210"),
    ("失せ物","うせもの","n","đồ thất lạc | vật bị mất | đồ đánh rơi","a lost article","1319790"),
    ("吸い物","すいもの","n","canh trong | súp thanh (kiểu Nhật) | canh nước trong","clear broth soup","1228390"),
    ("干物","ひもの","n","khô | cá khô | đồ hải sản phơi khô | khô cá","dried fish","1212090"),
    ("塗り物","ぬりもの","n","đồ sơn mài | đồ phủ sơn | hàng sơn mài","lacquerware | coating","1600010"),
    ("縫い物","ぬいもの","n","việc may vá | đồ khâu vá | nữ công kim chỉ | thêu thùa","sewing | needlework","1517720"),
    ("染め物","そめもの","n","đồ nhuộm | việc nhuộm vải | hàng nhuộm","dyeing | dyed goods","1843830"),
    ("鋳物","いもの","n","đồ đúc | vật đúc kim loại | hàng đúc","a casting | a cast-metal object","1426880"),
    ("練り物","ねりもの","n","hàng nhuyễn (chả cá, kẹo dẻo) | đồ nhào nặn | kiệu rước diễu hành","paste products | a parade float","1781410"),
    ("怪しげ","あやしげ","adj-na|n","đáng ngờ | khả nghi | mờ ám | không đáng tin | đáng hồ nghi","questionable | doubtful | suspicious","1200190"),
    ("曲者","くせもの","n","kẻ khả nghi | tên gian | người khó chơi | thứ không đơn giản | bậc thầy lão luyện","a suspicious fellow | a tricky thing | a master","1239910"),
    ("逸物","いちもつ","n","vật hảo hạng | hàng thượng phẩm | con vật/người xuất sắc | của hiếm","a first-rate specimen | a superb item","1167780"),
    ("好人物","こうじんぶつ","n","người tốt bụng | người hiền lành | người dễ mến | người tử tế","a good-natured, nice person","1277710"),
    ("重要人物","じゅうようじんぶつ","n","nhân vật quan trọng | yếu nhân | nhân vật chủ chốt | người then chốt","an important person | a key figure","1938030"),
    ("危険人物","きけんじんぶつ","n","nhân vật nguy hiểm | kẻ đáng ngại | mối nguy | phần tử nguy hiểm","a dangerous person | a loose cannon","1218620"),
    ("要注意人物","ようちゅういじんぶつ","n","đối tượng cần đề phòng | người cần để mắt | kẻ đáng cảnh giác | đối tượng theo dõi","a person to be wary of | a person under surveillance","1836180"),
    ("小心者","しょうしんもの","n","kẻ nhút nhát | người yếu bóng vía | kẻ hèn nhát | người rụt rè","a timid person | a coward","1743490"),
    ("慌て者","あわてもの","n","người hấp tấp | kẻ đãng trí | người hậu đậu | kẻ vội vàng cẩu thả","a scatterbrain | a careless person","1278840"),
    ("頑固者","がんこもの","n","người cố chấp | kẻ bướng bỉnh | người ngoan cố | kẻ cứng đầu","a stubborn, obstinate person","2640970"),
    ("卑怯者","ひきょうもの","n","kẻ hèn nhát | đồ hèn | kẻ tiểu nhân | kẻ chơi xấu","a coward | a sneaky person","1751860"),
    ("裏切り者","うらぎりもの","n","kẻ phản bội | đồ phản trắc | kẻ chỉ điểm | tên nội gián","a traitor | a turncoat | an informer","1550390"),
    ("邪魔者","じゃまもの","n","kẻ vướng víu | người cản trở | của nợ | kẻ gây phiền | vật chướng ngại","an obstacle | a hindrance | a nuisance","1323510"),
    ("新参者","しんざんもの","n","người mới đến | lính mới | tân binh | kẻ chân ướt chân ráo","a newcomer | a novice | a newbie","1361880"),
    ("古参","こさん","n|adj-no","kỳ cựu | lão làng | người thâm niên | cựu trào","a senior | a veteran | an old-timer","1265410"),
    ("古株","ふるかぶ","n","người kỳ cựu | lão làng | gốc cây cũ | kẻ thâm niên","an old-timer | a veteran","1265230"),
    ("新顔","しんがお","n","gương mặt mới | người mới | tân binh","a newcomer | a new face","1361630"),
    ("古顔","ふるがお","n","gương mặt quen thuộc | người cũ | lão làng | người gắn bó lâu","a familiar face | an old timer","1265240"),
    ("顔役","かおやく","n","người có thế lực | đại ca | trùm | người tai to mặt lớn","an influential man | a boss","1217870"),
    ("顔ぶれ","かおぶれ","n","thành phần | dàn nhân sự | đội hình | dàn diễn viên | danh sách tham gia","the personnel | the lineup | the cast","1217840"),
    ("黒幕","くろまく","n","kẻ giật dây | trùm cuối | thế lực ngầm | kẻ thao túng sau màn | bức màn đen","a wirepuller | a mastermind | a power broker","1288160"),
    ("台所事情","だいどころじじょう","n","tình hình tài chính | hoàn cảnh kinh tế | túi tiền | ngân sách","one's financial situation","2779990"),
    ("仲間割れ","なかまわれ","n|vs|vi","nội bộ lục đục | bè phái tan vỡ | mâu thuẫn nội bộ | chia rẽ phe cánh","a split among friends | internal discord","1425810"),
    ("泣き所","なきどころ","n","điểm yếu | gót chân Achilles | nhược điểm chí mạng | chỗ hiểm","a weak point | an Achilles' heel","1229700"),
    ("勘所","かんどころ","n","điểm mấu chốt | chỗ then chốt | điểm cốt yếu | bí quyết | vị trí phím (đàn)","the vital point | the crux | the key point","1590910"),
    ("急所","きゅうしょ","n","điểm hiểm | chỗ chí mạng | điểm mấu chốt | tử huyệt | chỗ yếu hại","a vital part | a weak point | the crux","1228750"),
    ("要所","ようしょ","n","vị trí trọng yếu | điểm chiến lược | nơi hiểm yếu | điểm chính | chốt chặn","an important position | a strategic point","1612150"),
    ("難所","なんしょ","n","đoạn đường hiểm trở | chặng gian nan | nơi khó vượt | đèo hiểm","a perilous spot (on a route) | a rough spot","1460990"),
    ("名跡","みょうせき","n","danh hiệu kế thừa | nghệ danh truyền đời | tên dòng họ danh giá","a hereditary family/professional name","1752530"),
    ("古巣","ふるす","n","chốn cũ | nơi từng gắn bó | tổ cũ | mái nhà xưa | chỗ quen thuộc cũ","one's old haunts | one's former home","1265720"),
    ("寝床","ねどこ","n","giường ngủ | chỗ ngủ | ổ nằm | giường chiếu","a bed | a berth","1360150"),
    ("病床","びょうしょう","n|adj-no","giường bệnh | giường bệnh nhân | nơi nằm dưỡng bệnh","a sickbed | a hospital bed","1490330"),
    ("死に水","しにみず","n","nước nhấp môi người hấp hối | giọt nước cuối đời (死に水を取る: chăm sóc đến cuối)","water given to a dying person","1767370"),
    ("切れ目","きれめ","n","chỗ đứt | khe hở | quãng ngắt | điểm gián đoạn | vết cắt | hồi kết","a gap | a break | a pause | an incision","1591930"),
    ("変わり目","かわりめ","n","bước ngoặt | thời điểm chuyển giao | giao thời | điểm thay đổi (季節の変わり目)","a turning point | a transition","1510780"),
    ("潮目","しおめ","n","ranh giới hai dòng hải lưu | bước ngoặt | thời cơ chuyển biến | điểm xoay chuyển","where two ocean currents meet | a turning point","1953800"),
    ("継ぎ目","つぎめ","n","mối nối | chỗ ghép | đường nối | khớp nối | mạch nối","a joint | a seam","1251860"),
    ("割れ目","われめ","n","vết nứt | khe nứt | kẽ hở | chỗ rạn | đường nứt","a crack | a crevice | a fissure","1607020"),
    ("裂け目","さけめ","n","vết rách | đường xé | khe nứt | vết toạc | kẽ hở","a tear | a rip | a slit | a crack","1558620"),
    ("口火","くちび","n","ngòi nổ | mồi lửa | nguồn cơn | nguyên nhân khơi mào (口火を切る)","a fuse | the trigger (of a conflict)","1275860"),
    ("皮切り","かわきり","n","sự khởi đầu | mở màn | bắt đầu | bước khởi đầu (を皮切りに)","the beginning | the start","1483880"),
    ("手始め","てはじめ","n","bước đầu tiên | khởi đầu | mở đầu | điểm xuất phát","the outset | the start | the beginning","1327700"),
    ("仕切り直し","しきりなおし","n","làm lại từ đầu | khởi động lại | bắt đầu lại | trở về vạch xuất phát","starting over | going back to square one","2620770"),
    ("着地点","ちゃくちてん","n","điểm tiếp đất | điểm hạ cánh | điểm chung | phương án dung hòa | kết luận thỏa hiệp","a landing point | common ground | a compromise","2670920"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
