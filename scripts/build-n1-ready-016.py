# -*- coding: utf-8 -*-
"""Build N1 ready wave 016 — 四字熟語 + literary/classical nouns (set 16)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-016.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("表裏一体","ひょうりいったい","n|adj-no","hai mặt một thể | gắn liền không tách rời | hai mặt của một vấn đề","two sides of the same coin | being inseparable","1489950"),
    ("不即不離","ふそくふり","n","bất tức bất ly | không gần không xa | trung lập | nửa vời","neutral | noncommittal","1493660"),
    ("平穏無事","へいおんぶじ","adj-na|n","bình yên vô sự | yên ổn | thái bình | êm đềm","peaceful | quiet | uneventful","1507080"),
    ("平々凡々","へいへいぼんぼん","adj-na|adj-no|adj-t|adv-to","hết sức tầm thường | bình bình | xoàng xĩnh | nhạt nhẽo","very ordinary | mediocre | quite commonplace","1751920"),
    ("豊年満作","ほうねんまんさく","n","năm được mùa | bội thu | mùa màng bội thu","bumper crops | year of a full harvest","2032580"),
    ("無理難題","むりなんだい","n","đòi hỏi vô lý | yêu sách quá quắt | làm khó dễ","unreasonable demand","1531020"),
    ("門前払い","もんぜんばらい","n|vs|vt","đuổi khách trước cửa | từ chối tiếp | đóng sầm cửa | bác đơn không xét","turning someone away | refusal of admission","1724730"),
    ("柔よく剛を制す","じゅうよくごうをせいす","exp|v5s","lấy nhu thắng cương | mềm thắng cứng | dĩ nhu chế cương","soft and fair goes far | the soft controls the hard","2637400"),
    ("優勝劣敗","ゆうしょうれっぱい","n","mạnh thắng yếu thua | đào thải tự nhiên | kẻ mạnh sống sót","survival of the fittest","1539330"),
    ("立身出世","りっしんしゅっせ","n|vs|vi","lập thân thành đạt | công thành danh toại | thăng tiến","success in life","1837780"),
    ("粒々辛苦","りゅうりゅうしんく","n|vs|vi","lao tâm khổ tứ | cần cù vất vả | đổ mồ hôi sôi nước mắt","tireless hard work | painstaking labor","1552900"),
    ("良妻賢母","りょうさいけんぼ","n","vợ hiền mẹ đảm | dâu thảo vợ hiền | người phụ nữ mẫu mực","good wife and wise mother","1775240"),
    ("良風美俗","りょうふうびぞく","n","thuần phong mỹ tục | tập tục tốt đẹp","good customs","1775270"),
    ("老若男女","ろうにゃくなんにょ","n","già trẻ gái trai | mọi lứa tuổi giới tính | nam phụ lão ấu","men and women of all ages","1561080"),
    ("論功行賞","ろんこうこうしょう","n","luận công ban thưởng | thưởng theo công trạng | phong thưởng","conferral of honors according to merits","1738660"),
    ("和魂洋才","わこんようさい","n","hồn Nhật tài Tây | tinh thần Nhật kết hợp học thuật phương Tây","Japanese spirit with Western learning","1562090"),
    ("曖昧模糊","あいまいもこ","adj-na|adj-t|adv-to","mơ hồ | mập mờ | lờ mờ | nhập nhằng","obscure | vague | ambiguous","1567940"),
    ("唯々","いい","adj-t|adv-to","ngoan ngoãn | nhất nhất vâng lời | phục tùng | dễ bảo","obedient | submissive | tame","2672330"),
    ("慇懃","いんぎん","adj-na|n","lễ phép | nhã nhặn | ân cần | thân mật","polite | courteous | civil","1566890"),
    ("慇懃無礼","いんぎんぶれい","adj-na|n","ngoài lễ phép trong khinh khi | lịch sự giả tạo | bằng mặt không bằng lòng","superficially polite but actually rude","1566900"),
    ("栄耀","えいよう","n","xa hoa | vinh hoa | phú quý | lộng lẫy","luxury | splendour | prosperity","1173980"),
    ("快刀","かいとう","n","đao sắc | gươm bén | dao sắc bén","sharp sword","1200140"),
    ("佳人薄命","かじんはくめい","exp","hồng nhan bạc mệnh | giai nhân yểu mệnh | tài sắc lận đận","beauties die young","1189820"),
    ("活殺自在","かっさつじざい","n","nắm quyền sinh sát | toàn quyền định đoạt sống chết","the power of life or death","1747240"),
    ("玩物喪志","がんぶつそうし","n","mải chơi quên chí | đam mê tiểu tiết bỏ bê đại sự","being distracted by trivia and losing sight of one's goal","2043270"),
    ("旧弊","きゅうへい","n|adj-na","tệ nạn cũ | hủ tục | lạc hậu | bảo thủ cổ hủ","old evils | outdated notions | antiquated","1231260"),
    ("窮余","きゅうよ","n","bước đường cùng | cùng quẫn | tuyệt vọng","extremity | desperation","1742000"),
    ("喬木","きょうぼく","n","cây cao | đại thụ | cây thân gỗ cao","tall tree | forest tree","1235940"),
    ("金城","きんじょう","n","thành trì kiên cố | thành vàng | thành lũy bất khả xâm","impregnable castle | inner citadel","1682190"),
    ("金城鉄壁","きんじょうてっぺき","n|adj-no","thành đồng vách sắt | phòng thủ kiên cố | bất khả xâm phạm","impregnable | invulnerable | unassailable","1682200"),
    ("苦肉","くにく","n","khổ nhục | tự gây đau cho mình (để lừa địch)","hurting oneself (to trick an adversary)","1685010"),
    ("苦肉の策","くにくのさく","exp|n","khổ nhục kế | kế cùng | nước cờ liều cuối cùng","last resort | desperate measure","1244600"),
    ("君子","くんし","n","quân tử | người đức hạnh | bậc hiền nhân | đấng trượng phu","man of virtue | wise man | gentleman","1247270"),
    ("鯨飲馬食","げいいんばしょく","exp|n|vs|vi","ăn như rồng cuốn uống như voi | ăn uống vô độ | chén tì tì","drinking like a fish and eating like a horse","1616880"),
    ("迷宮","めいきゅう","n","mê cung | mê lộ | bí ẩn | (vụ án) bế tắc","labyrinth | maze | mystery","1532730"),
    ("言行","げんこう","n","lời nói và việc làm | ngôn hành | nói và làm","speech and behaviour","1264470"),
    ("巧遅","こうち","n","khéo nhưng chậm | làm kỹ mà lề mề | tinh xảo nhưng trì trệ","elaborate but slow execution","1741540"),
    ("荒涼","こうりょう","adj-t|adv-to","hoang vu | tiêu điều | hiu quạnh | xơ xác","desolate | dreary | bleak","1281680"),
    ("克己復礼","こっきふくれい","n|vs","khắc kỷ phục lễ | tự kiềm chế giữ lễ nghi | tu thân giữ lễ","exercising self-restraint and conforming to etiquette","2045300"),
    ("古今","ここん","n|adj-no","cổ kim | xưa và nay | mọi thời đại","ancient and modern times | all ages","1265380"),
    ("故事","こじ","n","điển tích | sự tích xưa | truyền thuyết | điển cố","historical event | tradition | legend | origin","1267170"),
    ("五臓六腑","ごぞうろっぷ","n","ngũ tạng lục phủ | toàn bộ nội tạng | tận đáy lòng","the five viscera and six organs | inside one's body","1268490"),
    ("権化","ごんげ","n","hóa thân | hiện thân | hiện thân (cái ác) | nhân cách hóa","incarnation | embodiment | personification","1258110"),
    ("才色兼備","さいしょくけんび","n","tài sắc vẹn toàn | vừa thông minh vừa xinh đẹp (nữ)","gifted with both intelligence and beauty","1294540"),
    ("三位一体","さんみいったい","n","tam vị nhất thể | Ba Ngôi (Kitô giáo) | ba thành phần hợp nhất","the Trinity | three components in one","1299860"),
    ("歯牙","しが","n","răng | răng và ngà | răng nanh","teeth | teeth and tusks","1313190"),
    ("自縄自縛","じじょうじばく","n","tự trói buộc mình | gậy ông đập lưng ông | tự chuốc lấy","being caught in one's own trap","1318490"),
    ("質実","しつじつ","adj-na|n","mộc mạc | chân chất | giản dị | thật thà","simplicity | plainness","1647290"),
    ("杓子定規","しゃくしじょうぎ","adj-na|n","máy móc | rập khuôn | cứng nhắc | câu nệ quy tắc","inflexible | hidebound | being a stickler for rules","1324160"),
    ("熟慮","じゅくりょ","n|vs|vt","cân nhắc kỹ | suy xét thấu đáo | thận trọng nghĩ kỹ","deliberation | thoughtful consideration","1337910"),
    ("順風","じゅんぷう","n","gió thuận | thuận buồm | gió xuôi","favourable wind","1580200"),
    ("笑止","しょうし","adj-na|n","đáng cười | lố bịch | nực cười | đáng thương hại","laughable | ridiculous | pitiful | absurd","1351410"),
    ("深山","しんざん","n","thâm sơn | núi sâu | thẳm sâu trong núi | rừng sâu núi thẳm","deep in the mountains | mountain recesses","2866110"),
    ("酔狂","すいきょう","n|adj-na","ngông cuồng | hứng bất tử | kỳ quặc | lập dị","whim | caprice | eccentricity","1595520"),
    ("雪辱","せつじょく","n|vs|vi","rửa hận | phục thù | gỡ gạc danh dự | rửa nhục","vindication of honour | revenge","1386640"),
    ("脱兎","だっと","n|adj-no","nhanh như thỏ chạy | nhanh như cắt | tốc độ phi thường","something unusually fast | fleeing hare","1802510"),
    ("端麗","たんれい","adj-na|n","tú lệ | xinh đẹp | thanh tú | đoan trang","fine-looking | beautiful | graceful | elegant","1418980"),
    ("泥沼","どろぬま","n","đầm lầy | vũng bùn | sa lầy | bế tắc khó thoát","bog | marsh | quagmire | quandary","1436950"),
    ("徒労","とろう","n","công cốc | uổng công | dã tràng xe cát | vô ích","fruitless effort | wasted effort | futility","1444520"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
