# -*- coding: utf-8 -*-
"""Build N1 ready wave 003 — formal Sino-Japanese nouns/verbs (set 3)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-003.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("対峙","たいじ","n|vs|vi","đối đầu | đối diện | đương đầu | giằng co","confrontation | standing opposite | squaring off","1410330"),
    ("退治","たいじ","n|vs|vt","tiêu diệt | trừ khử | dẹp bỏ | tận diệt","extermination | elimination | getting rid of","1411390"),
    ("台頭","たいとう","n|vs|vi","trỗi dậy | nổi lên | vươn lên | nổi bật","rise | emergence | gaining prominence","1412730"),
    ("妥結","だけつ","n|vs|vi","đạt thỏa thuận | dàn xếp xong | ngã ngũ","settlement | agreement","1408530"),
    ("打診","だしん","n|vs|vt","thăm dò | dò ý | gõ chẩn (y học)","sounding out (intentions) | percussion | tapping","1408910"),
    ("堪能","たんのう","adj-na|n|vs|vt|vi","thành thạo | giỏi | thỏa thuê | thưởng thức trọn vẹn","proficient | skilled | enjoying to the full","1211370"),
    ("端的","たんてき","adj-na","thẳng thắn | trực tiếp | ngắn gọn | rõ ràng","frank | direct | straightforward | concise","1418940"),
    ("躊躇","ちゅうちょ","n|vs|vt|vi","do dự | chần chừ | ngần ngại | lưỡng lự","hesitation | indecision | vacillation","1573370"),
    ("重複","ちょうふく","n|vs|vi|adj-no","trùng lặp | lặp lại | chồng chéo | dư thừa","duplication | repetition | overlapping | redundancy","1579980"),
    ("眺望","ちょうぼう","n|vs|vt","tầm nhìn | quang cảnh | toàn cảnh | viễn cảnh","view | vista | panorama | prospect","1428840"),
    ("重宝","ちょうほう","adj-na|n|vs|vt","tiện lợi | hữu ích | đắc dụng | vật quý","convenient | useful | handy | priceless treasure","1579990"),
    ("凋落","ちょうらく","n|vs|vi","suy tàn | lụi tàn | sa sút | héo úa","decline | fall | decay | withering","1427490"),
    ("直面","ちょくめん","n|vs|vi","đối mặt | đương đầu | giáp mặt","confrontation | to face | to confront","1431540"),
    ("沈滞","ちんたい","n|vs|vi","trì trệ | đình trệ | ngưng đọng","stagnation | inactivity","1431750"),
    ("追跡","ついせき","n|vs|vt|adj-no","truy đuổi | truy tìm | bám theo | theo dõi","chase | pursuit | tracking | tracing","1432560"),
    ("痛感","つうかん","n|vs|vt","cảm nhận sâu sắc | thấm thía | nhận ra rõ ràng","feeling keenly | fully realizing","1432760"),
    ("撤回","てっかい","n|vs|vt|adj-no","rút lại | thu hồi | hủy bỏ | bãi bỏ","withdrawal | retraction | revocation","1437710"),
    ("転嫁","てんか","n|vs|vt","đổ (lỗi, trách nhiệm) | trút lên | đùn đẩy","shifting (blame, responsibility) | imputation","1441060"),
    ("転落","てんらく","n|vs|vi","rơi xuống | té ngã | tụt dốc | sa cơ","fall | tumble | downfall | descent","1441370"),
    ("咎める","とがめる","v1|vt|vi","khiển trách | trách móc | bắt lỗi | gặng hỏi | (vết thương) trở nặng","to blame | to reproach | to find fault | to aggravate (injury)","1565100"),
    ("途絶える","とだえる","v1|vi","gián đoạn | đứt đoạn | ngừng hẳn | bặt vô âm tín","to stop | to cease | to come to an end | to cut off","1444900"),
    ("途方","とほう","n","đường lối | lý lẽ | phương cách (途方に暮れる: bối rối không biết làm gì)","way | reason | means","1444930"),
    ("吐露","とろ","n|vs|vt","bộc bạch | thổ lộ | giãi bày | nói ra","expressing one's mind | speaking out","1444190"),
    ("内紛","ないふん","n","nội chiến | mâu thuẫn nội bộ | lục đục bên trong","internal discord | internal strife | infighting","1599380"),
    ("難航","なんこう","n|vs|vi","gặp khó khăn | bế tắc | trắc trở | tiến triển chật vật","rough going | running into trouble | proceeding with difficulty","1460950"),
    ("粘る","ねばる","v5r|vi","dính | dẻo | kiên trì | bám trụ | nán lại","to be sticky | to persevere | to persist | to hold out","1469700"),
    ("念頭","ねんとう","n","trong tâm trí | để tâm | lưu ý (念頭に置く)","(on one's) mind | heed","1469440"),
    ("培養","ばいよう","n|vs|vt","nuôi cấy | gây giống | bồi dưỡng | vun đắp","culture | cultivation | nurturing","1473360"),
    ("波及","はきゅう","n|vs|vi","lan rộng | lan tỏa | ảnh hưởng dây chuyền","spread | extension | ripple effect","1470990"),
    ("頒布","はんぷ","n|vs|vt","phân phát | phát hành | lưu hành","distribution | circulation","1482000"),
    ("匹敵","ひってき","vs|vi","sánh ngang | tương đương | ngang tầm | địch nổi","to be a match for | to rival | to equal","1487250"),
    ("披露","ひろう","n|vs|vt","công bố | trình diễn | ra mắt | giới thiệu","announcement | presentation | unveiling","1483490"),
    ("疲弊","ひへい","n|vs|vi","kiệt quệ | mệt mỏi rã rời | suy kiệt (tài chính)","exhaustion | fatigue | financial exhaustion","1483770"),
    ("皮肉","ひにく","n|adj-na|adj-no","mỉa mai | châm biếm | trớ trêu | éo le","irony | sarcasm | cynicism | unexpected (twist)","1483900"),
    ("誹謗","ひぼう","n|vs|vt","phỉ báng | bôi nhọ | nói xấu","slander | abuse","1484580"),
    ("標榜","ひょうぼう","n|vs|vt","nêu cao | giương cao | chủ trương | tự nhận","advocating | championing | professing","1488830"),
    ("紛糾","ふんきゅう","n|vs|vi","rối ren | hỗn loạn | tranh cãi | rắc rối","complication | confusion | dispute | conflict","1505040"),
    ("不審","ふしん","n|adj-na","khả nghi | đáng ngờ | hồ nghi | kỳ lạ","doubt | suspicion | strangeness","1493120"),
    ("払拭","ふっしょく","n|vs|vt","xóa tan | quét sạch | trừ bỏ | xua tan","wiping out | sweeping away | dispelling","1501640"),
    ("併合","へいごう","n|vs|vt|vi","sáp nhập | hợp nhất | thôn tính","merger | amalgamation | annexation","1506110"),
    ("弊害","へいがい","n","tác hại | hệ lụy xấu | tệ nạn | mặt trái","harmful effect | evil practice | abuse","1508270"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
