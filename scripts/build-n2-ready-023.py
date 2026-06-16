# -*- coding: utf-8 -*-
"""Build N2 ready wave 023 — onomatopoeia / mimetic words (giongo/gitaigo)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-023.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("わくわく","わくわく","vs|adv|adv-to","háo hức | nôn nao | rộn ràng | hồi hộp vui sướng","to be excited | to be thrilled","1013310"),
    ("くよくよ","くよくよ","vs|adv|adv-to","ưu phiền | lo lắng vẩn vơ | day dứt mãi","to fret | to brood | to worry","1003930"),
    ("もじもじ","もじもじ","adv|vs","rụt rè | ngượng ngùng | bồn chồn không yên","bashfully | hesitantly | fidgety","1012570"),
    ("しんみり","しんみり","adv|adv-to|vs","lặng lẽ | trầm lắng | tâm tình | bùi ngùi","quietly | solemnly | heart-to-heart | sadly","1005820"),
    ("がっかり","がっかり","vs|adv","thất vọng | chán nản | xìu xuống | mệt rã rời","to be disappointed | to be dejected | to feel drained","1003170"),
    ("がっちり","がっちり","adv|adv-to|vs","chắc nịch | vạm vỡ | chặt chẽ | tính toán kỹ","solid | robust | well-built | shrewd","1003210"),
    ("ばったり","ばったり","adv|adv-to","đánh rầm | bất ngờ (gặp) | đột ngột (dừng/ngã)","with a thud | unexpectedly (meeting) | abruptly (halting)","1632430"),
    ("げっそり","げっそり","vs|adv-to|adv","hốc hác | sọp đi | chán nản | sút cân đột ngột","looking emaciated | to be disheartened","1004250"),
    ("ひっそり","ひっそり","adv-to|adv|vs","yên ắng | vắng lặng | tĩnh mịch | kín đáo","quiet | still | deserted | inconspicuously","1010550"),
    ("ほっそり","ほっそり","adv|adv-to|vs","mảnh mai | thon thả | mảnh khảnh","slim | slender | delicate","2009720"),
    ("ずっしり","ずっしり","adv|adv-to|vs","nặng trĩu | trĩu nặng | nặng sâu sắc","heavily | profoundly","1006370"),
    ("どっしり","どっしり","adv|adv-to|vs","nặng đồ sộ | bề thế | vững chãi | điềm tĩnh","bulky and heavy | massive | dignified | composed","1632270"),
    ("こってり","こってり","adv|adv-to|vs","đậm đà | béo ngậy | nồng đậm | nặng nề (mắng)","thickly | richly | severely","2008110"),
    ("ほんのり","ほんのり","adv|adv-to|vs","thoang thoảng | phơn phớt | hơi hơi","slightly | faintly","1011750"),
    ("じんわり","じんわり","adv|adv-to","từ từ | dần dần | rịn ra (mồ hôi, nước mắt)","gradually | steadily | seeping out","1006030"),
    ("こんがり","こんがり","adv|adv-to","vàng ruộm | chín giòn | nướng vàng","well-cooked | well-done | browned","2008190"),
    ("くるくる","くるくる","adv|adv-to|vs","xoay tròn | quay vòng vòng | cuộn quanh | thoăn thoắt","whirling | spinning | round and round | working tirelessly","1003960"),
    ("ぐるぐる","ぐるぐる","adv|adv-to","vòng vòng | quay tròn | quấn quanh","round and round | in circles | winding around","1004140"),
    ("ちらちら","ちらちら","adv-to|vs","lất phất | lập lòe | thấp thoáng | liếc trộm","fluttering | flickering | catching glimpses","1007910"),
    ("つるつる","つるつる","adj-na|adj-no|adv|vs|adv-to","trơn nhẵn | bóng loáng | trơn trượt | xì xụp (mì)","smooth | shiny | slippery | slurping (noodles)","1008220"),
    ("さらさら","さらさら","adv|adv-to|adj-no|vs","rì rào | róc rách | mượt mà | trôi chảy | khô tơi","rustling | rippling | smooth and dry | fluently","1005310"),
    ("ぐちゃぐちゃ","ぐちゃぐちゃ","adv|adj-na|adv-to|vs","nhão nhoét | bầy hầy | lộn xộn | bừa bộn","pulpy | soppy | untidy | chaotic","1004050"),
    ("ぐにゃぐにゃ","ぐにゃぐにゃ","adj-na|adj-no|adv|adv-to|vs","mềm oặt | nhũn nhão | mềm dẻo","flabby | limp | soft and pliable","1004090"),
    ("ふわふわ","ふわふわ","adv-to|adv|adj-no|adj-na|vs","bồng bềnh | mềm xốp | êm ái | bay bổng | hời hợt","lightly floating | soft | fluffy | frivolously","1113060"),
    ("ぷるぷる","ぷるぷる","adv|adv-to|vs","run rẩy | rung rinh | giần giật | dẻo dai rung","trembling | jiggling | wobbling","2546190"),
    ("もちもち","もちもち","adj-no|vs","dẻo dai | dai mềm | dẻo như mochi","springy (texture) | doughy | elastic","2403780"),
    ("ほくほく","ほくほく","adv|vs|adj-no","bở tơi | bùi xốp (khoai) | hớn hở | khoái chí","soft and flaky | fluffy | beaming happily","1011600"),
    ("しっとり","しっとり","adv|adv-to|vs","ẩm dịu | mềm mượt | êm đềm | dịu dàng | duyên dáng","damp | moist | calm | gentle | graceful","2121280"),
    ("ぽかぽか","ぽかぽか","adj-no|adv-to|adv|vs","ấm áp | ấm sực | nện thùm thụp","pleasantly warm | repeatedly hitting","1011930"),
    ("ぞくぞく","ぞくぞく","adv|adv-to|vs","rùng mình | ớn lạnh | sởn gai ốc | háo hức","shivering | shuddering (with fear) | thrilled","1007140"),
    ("ぶるぶる","ぶるぶる","adv|adv-to|vs","run lẩy bẩy | run rẩy | rung lắc","trembling | shivering | shaking","1011260"),
    ("ずきんずきん","ずきんずきん","adv|adv-to|vs","nhói buốt | giật giật (đau) | đau nhức","throbbing (pain) | pounding | stinging","2123380"),
    ("ぱくぱく","ぱくぱく","adv|adv-to|vs","há ngậm liên tục | ăn ngấu nghiến | nhồm nhoàm","opening and closing (mouth) | heartily eating | devouring","1010380"),
    ("もぐもぐ","もぐもぐ","adv|vs|adv-to","nhồm nhoàm | nhai trệu trạo | lúng búng (nói)","mumbling | chewing | squirming","2009920"),
    ("ごくごく","ごくごく","adv|adv-to","ừng ực | uống ừng ực từng ngụm lớn","drinking in big gulps","2178890"),
    ("べらべら","べらべら","adj-na|adv|n|vs","liến thoắng | bô bô | nói trơn tru | mỏng dính","non-stop talking | chattering | thin | flimsy","1011500"),
    ("ぶつぶつ","ぶつぶつ","n|adv|adv-to","lẩm bẩm | càu nhàu | mụn lấm tấm | cắt vụn","grumble | mutter | pimples | cutting into small pieces","1011200"),
    ("ちゃきちゃき","ちゃきちゃき","adj-no|n|adv|adv-to","chính cống | thuần chủng | tháo vát | lanh lẹ","trueborn | genuine | capable | briskly","1007600"),
    ("あたふた","あたふた","adv|adv-to|vs","vội vã | cuống quýt | hốt hoảng luống cuống","in a hurry | hurriedly | in a panic","1631590"),
    ("うじうじ","うじうじ","adv|adv-to|vs","do dự | lưỡng lự | ngần ngừ | thiếu quả quyết","indecisively | hesitantly | irresolutely","1000960"),
    ("だらだら","だらだら","adv|adv-to|vs","nhỏ giọt | thoai thoải | lê thê | dây dưa | lề mề","dripping | gently sloping | endlessly | sluggishly","1007510"),
    ("ちんたら","ちんたら","adv|adv-to|vs","lề mề | chậm chạp | rề rà | đủng đỉnh","dilatorily | sluggishly | taking a lot of time","2069050"),
    ("ぐんぐん","ぐんぐん","adv|adv-to","vùn vụt | nhanh chóng | vượt bậc | đều đặn","rapidly | by leaps and bounds | steadily","1004160"),
    ("すくすく","すくすく","adv|adv-to","lớn nhanh | phát triển nhanh (trẻ, cây)","growing quickly | developing fast","2008410"),
    ("ちびちび","ちびちび","adv|adv-to","nhấm nháp | từng chút một | dè sẻn","little by little | bit by bit | sparingly","1007590"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
