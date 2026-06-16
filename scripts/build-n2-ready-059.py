# -*- coding: utf-8 -*-
"""Build N2 ready wave 059 — resolve/initiative, 〜行 sino-verbs, fighting spirit, training, deeds."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-059.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("一念発起","いちねんほっき","n|vs|vi","quyết tâm dốc lòng | hạ quyết tâm làm","being resolved to (do something) | wholehearted intention","1165630"),
    ("不言実行","ふげんじっこう","n","làm hơn nói | hành động trước lời nói | im lặng mà làm","action before words | work before talk","1492260"),
    ("率先垂範","そっせんすいはん","n","làm gương đi đầu | nêu gương tiên phong","setting an example by taking the initiative","2033060"),
    ("率先","そっせん","n|vs|vi","đi đầu | tiên phong | chủ động làm trước","taking the initiative","1596560"),
    ("先手必勝","せんてひっしょう","exp","ra tay trước ắt thắng | đánh nhanh thắng nhanh | đi trước thắng","victory goes to the one who makes the first move","2031680"),
    ("先制","せんせい","n|vs|vt|adj-no","ra đòn phủ đầu | chiếm tiên cơ | mở màn trước","head start | initiative | preemption","1387980"),
    ("速攻","そっこう","n|vs|vt|adv","tấn công chớp nhoáng | đánh nhanh | ngay lập tức","swift attack | fast break | right away","1654850"),
    ("強行","きょうこう","n|vs|vt","cưỡng ép tiến hành | làm bằng được | thực hiện cứng rắn","forcing | carrying out (forcibly) | pushing ahead","1236270"),
    ("励行","れいこう","n|vs|vt","thực hiện nghiêm túc | chấp hành nghiêm | tuân thủ chặt","strict observance | diligent execution","1557410"),
    ("続行","ぞっこう","n|vs|vt","tiếp tục | tiếp diễn | nối lại","continuation | going on | resuming","1405810"),
    ("代行","だいこう","n|vs|vt|adj-no","làm thay | đại diện thực hiện | thừa hành thay","acting as agent | acting on (someone's) behalf","1411850"),
    ("随行","ずいこう","n|vs|vi","tháp tùng | đi theo | tùy tùng","attendant | follower","1372740"),
    ("同行","どうこう","n|vs|vi","đi cùng | đồng hành | cùng đi","accompanying (someone) | travelling together","1452340"),
    ("逆行","ぎゃっこう","n|vs|vi","đi ngược | thụt lùi | đi ngược lại (xu thế)","backward movement | retrogression | going against","1227030"),
    ("退行","たいこう","n|vs|vi","thoái lui | thoái hóa | thoái triển","retrogression | regression","1779170"),
    ("慣行","かんこう","n|adj-no","thông lệ | tập quán | lệ thường | sự kiện truyền thống","customary practice | habit","1212680"),
    ("励まし","はげまし","n|adj-no","sự động viên | lời cổ vũ | sự khích lệ","encouragement | cheering on","1901610"),
    ("気合","きあい","n","khí thế | tinh thần | sự gồng mình | tiếng hô","(fighting) spirit | motivation | yell | kiai","1591030"),
    ("活","かつ","n|suf","sự sống | sinh khí | thuật hồi sinh (judo) | hoạt động","living | life | art of resuscitation | activity","2078050"),
    ("喝","かつ","int|n","tiếng quát răn (Thiền) | quát mắng đe nẹt","exclamation used to scold (in Zen) | scolding with a shout","2395840"),
    ("発破","はっぱ","n","nổ mìn (xây dựng, khai mỏ) | việc phá nổ","explosive blast (in construction) | blasting","1477800"),
    ("鼓舞激励","こぶげきれい","n","cổ vũ khích lệ | động viên hết mình","encouragement","1268030"),
    ("叱咤激励","しったげきれい","n|vs","quát mắng khích lệ | vừa rầy vừa động viên","giving a loud pep talk | strongly encouraging","2031220"),
    ("奮起","ふんき","n|vs|vi","phấn chấn | vùng dậy | dấy lên quyết tâm","stirring | rousing oneself","1504720"),
    ("発奮","はっぷん","n|vs|vi","phấn khích | được kích thích | hăng hái lên","being roused | being inspired | being spurred on","1600840"),
    ("奮闘","ふんとう","n|vs|vi","nỗ lực hết mình | vật lộn | chiến đấu kiên cường","strenuous effort | hard struggle | hard fighting","1504750"),
    ("健闘","けんとう","n|vs|vi","chiến đấu dũng cảm | nỗ lực hết sức","fighting bravely | strenuous efforts","1256380"),
    ("苦闘","くとう","n|vs|vi","vật lộn gian khổ | chiến đấu chật vật","hard fight | difficult struggle","1244580"),
    ("力闘","りきとう","n|vs|vi","chiến đấu hết sức | gắng sức chiến","hard fight","1555160"),
    ("善戦","ぜんせん","n|vs|vi","thi đấu kiên cường | chiến đấu ngoan cường","fighting a good fight | putting up a good fight","1394480"),
    ("敢闘","かんとう","n|vs|vi","chiến đấu dũng cảm | quả cảm chiến","fighting bravely","1212900"),
    ("闘志","とうし","n","ý chí chiến đấu | tinh thần chiến đấu","fighting spirit | will to fight","1653040"),
    ("闘魂","とうこん","n","tinh thần chiến đấu | đấu hồn | máu chiến","fighting spirit","1653050"),
    ("胆力","たんりょく","n","gan dạ | bản lĩnh | sự can đảm","courage | nerve | grit","1419060"),
    ("精神力","せいしんりょく","n","sức mạnh tinh thần | nghị lực | ý chí","emotional strength | force of will","1751140"),
    ("精神論","せいしんろん","n","duy ý chí | thuyết tinh thần | chủ nghĩa duy tâm","spiritualism | idealism","2748280"),
    ("根性論","こんじょうろん","n","thuyết ý chí | quan niệm có chí thì nên | duy tinh thần","belief that where there's a will, there's a way","2779880"),
    ("精進","しょうじん","n|vs|vi","tinh tấn | chuyên cần | dốc lòng tu | ăn chay","diligence | devotion | asceticism | vegetarian diet","1380040"),
    ("研鑽","けんさん","n|vs|vt","dùi mài học hỏi | nghiên cứu chuyên sâu | trau dồi","diligent study | devoting oneself to studies","1258700"),
    ("修練","しゅうれん","n|vs|vt","rèn luyện | tập luyện | tu luyện","training | drill | discipline","1594800"),
    ("修行僧","しゅぎょうそう","n","tăng tu hành | nhà sư khổ luyện","ascetic monk | trainee monk","2517650"),
    ("荒行","あらぎょう","n","tu khổ hạnh | khổ luyện gian nan","asceticism","1281560"),
    ("苦行","くぎょう","n|vs|vi","khổ hạnh | hành xác | việc cực nhọc","penance | austerities | strenuous task","1244460"),
    ("難行","なんぎょう","n","khổ tu | tu hành gian khổ","penance","1460960"),
    ("業","ぎょう","n|n-suf","nghề | việc | công ty | ngành | sự học","work | business | company | study","2153730"),
    ("徳","とく","n","đức | đức độ | lòng nhân | lợi ích","virtue | benevolence | benefit","2080970"),
    ("功徳","くどく","n","công đức | việc thiện | phúc đức | ơn trên","merit | virtuous deed | divine reward | blessing","1275080"),
    ("善行","ぜんこう","n|adj-no","việc thiện | hành vi tốt | thiện hạnh","good deed | good conduct | benevolence","1394380"),
    ("悪行","あくぎょう","n","việc ác | hành vi xấu xa | tội ác","misdeed | wrongdoing | wickedness","1575740"),
    ("非行","ひこう","n|adj-no","hành vi sai trái | sự hư hỏng | phạm pháp (vị thành niên)","delinquency | misconduct","1484870"),
    ("愚行","ぐこう","n","hành động ngu xuẩn | việc dại dột","foolish act | folly","1245130"),
    ("蛮行","ばんこう","n","hành vi man rợ | sự dã man | tàn bạo","act of barbarity | brutality | savagery","1482500"),
    ("凶行","きょうこう","n","hành vi hung bạo | trọng án | vụ giết người","(act of) violence | vicious crime | murder","1591570"),
    ("暴挙","ぼうきょ","n","hành động liều lĩnh | việc làm càn | sự xằng bậy","violence | reckless action | (an) outrage","1519440"),
    ("快挙","かいきょ","n","kỳ tích | chiến công vang dội | thành tích rạng rỡ","brilliant achievement | spectacular feat","1200020"),
    ("壮挙","そうきょ","n","sự nghiệp vĩ đại | việc làm hào hùng | đại sự táo bạo","ambitious undertaking | daring enterprise","1660720"),
    ("義挙","ぎきょ","n","nghĩa cử | việc nghĩa | hành động cao thượng","noble undertaking | heroic deed","1756000"),
    ("功業","こうぎょう","n","công lao | thành tựu | công tích","exploit | achievement","1275050"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
