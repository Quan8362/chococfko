# -*- coding: utf-8 -*-
"""Build N2 ready wave 046 — compound verbs (handling, discarding, motion, smashing, attaching)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-046.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("押しとどめる","おしとどめる","v1|vt","ngăn lại | chặn lại | kìm giữ","to check | to stop | to keep back","1862380"),
    ("仕損じる","しそんじる","v1|vt","làm hỏng | thất bại | làm sai","to blunder | to fail | to make a mistake","1594310"),
    ("し損なう","しそこなう","v5u|vt","làm hỏng | lỡ | trượt | làm sai","to blunder | to fail | to miss","1594300"),
    ("取り逃がす","とりにがす","v5s|vt","để sổng | bắt hụt | để vuột mất","to fail to catch | to let slip | to miss","1707720"),
    ("取りこぼす","とりこぼす","v5s|vi","thua trận dễ thắng | thua bất ngờ | để mất (thông tin)","to lose an easy game | to suffer an unexpected defeat","1326520"),
    ("取りやめる","とりやめる","v1|vt","hủy bỏ | đình lại | hoãn","to cancel | to call off","1654720"),
    ("取り下げる","とりさげる","v1|vt","rút lại | rút (đơn kiện) | từ bỏ","to withdraw | to abandon (a lawsuit)","1326570"),
    ("かき消す","かきけす","v5s|vt","xóa sạch | át đi (tiếng) | làm biến mất","to erase | to drown out | to make disappear","1851920"),
    ("消し去る","けしさる","v5r|vt","xóa bỏ | xua tan | xóa sạch | tẩy trừ","to get rid of | to erase | to eradicate","1952630"),
    ("拭い去る","ぬぐいさる","v5r","lau sạch | xóa sạch | xua tan | tẩy đi","to rub out | to clear away | to erase","2462650"),
    ("葬り去る","ほうむりさる","v5r|vt","chôn vùi vào quên lãng | xóa khỏi lịch sử","to consign to oblivion","1908140"),
    ("振り捨てる","ふりすてる","v1|vt","dứt bỏ | rũ bỏ | từ bỏ dứt khoát","to shake off | to forsake","1361230"),
    ("使い捨てる","つかいすてる","v1|vt","dùng một lần rồi bỏ | dùng xong vứt","to use and then throw away","2644500"),
    ("脱ぎ捨てる","ぬぎすてる","v1|vt","cởi vứt | vứt bỏ (quần áo, lề thói cũ)","to throw off (clothes) | to discard (old habits)","1416390"),
    ("かなぐり捨てる","かなぐりすてる","v1|vt","vứt phăng | gạt bỏ hết | quẳng đi không thương tiếc","to fling off | to cast aside | to abandon","2016950"),
    ("投げ捨てる","なげすてる","v1|vt","ném bỏ | vứt đi | quăng đi","to throw away","1447030"),
    ("打ち捨てる","うちすてる","v1|vt","bỏ mặc | vứt bỏ | bỏ rơi","to throw away | to abandon","1849470"),
    ("追いやる","おいやる","v5r|vt","xua đi | đẩy vào (tình cảnh xấu) | dồn ép","to drive away | to force into (a bad situation)","1432310"),
    ("押しやる","おしやる","v5r|vt","đẩy ra | gạt sang một bên | xô đi","to push away | to push aside | to shove","1850190"),
    ("見やる","みやる","v5r|vt","nhìn về | đưa mắt nhìn | ngắm nhìn","to look at | to gaze | to stare at","1259280"),
    ("思いやる","おもいやる","v5r|vt","quan tâm | thông cảm | lo lắng cho | nghĩ đến","to sympathize with | to be considerate of | to worry about","1851450"),
    ("請け負う","うけおう","v5u|vt","nhận thầu | đảm nhận | chịu trách nhiệm","to contract (to do) | to undertake | to be liable for","1381300"),
    ("背負う","せおう","v5u|vt|vi","cõng | gánh vác | mang trên lưng | tự phụ","to carry on one's back | to be burdened with","1472860"),
    ("背負い込む","しょいこむ","v5m","gánh lên vai | ôm đồm (nợ nần, trách nhiệm)","to carry on one's back | to burden oneself","2462700"),
    ("溜め込む","ためこむ","v5m|vt","tích trữ | dồn lại | gom góp | cất giấu","to save up | to stockpile | to hoard","1552640"),
    ("丸め込む","まるめこむ","v5m|vt","dụ dỗ | lừa phỉnh | lôi kéo | cuộn nhét vào","to coax | to cajole | to win over","1216310"),
    ("めり込む","めりこむ","v5m|vi","lún vào | sa lầy | kẹt vào | cắm vào","to sink (into) | to get stuck in | to get bogged down","1682880"),
    ("食い込む","くいこむ","v5m|vi","cắt vào | hằn vào | lấn vào | thâm nhập | xén vào (giờ, tiền)","to bite into | to encroach | to cut into (time, savings)","1358180"),
    ("立ち入る","たちいる","v5r|vi","bước vào | xâm phạm | can thiệp | đi sâu vào","to enter | to trespass | to meddle | to delve deeper","1852100"),
    ("遠ざける","とおざける","v1|vt","tránh xa | giữ khoảng cách | xa lánh","to keep away | to keep at a distance","1177840"),
    ("過ぎ去る","すぎさる","v5r|vi","trôi qua | qua đi | đi ngang qua","to pass | to pass by","1195990"),
    ("連れ去る","つれさる","v5r|vt","dẫn đi | mang đi | bắt cóc","to take away | to abduct | to kidnap","1559300"),
    ("持ち去る","もちさる","v5r|vt","mang đi | đem đi mất","to take away | to carry away","1315560"),
    ("崩れ去る","くずれさる","v5r|vi","sụp đổ | tan vỡ | đổ sập hoàn toàn","to crumble away | to collapse","1871990"),
    ("舞い戻る","まいもどる","v5r|vi","quay về | trở lại","to come back | to return","1499090"),
    ("立ち戻る","たちもどる","v5r|vi","quay lại | trở về (điểm xuất phát)","to return | to come back","1551480"),
    ("呼び戻す","よびもどす","v5s|vt","gọi về | triệu hồi | gợi lại (ký ức)","to call back | to recall | to bring back (memories)","1266410"),
    ("盛り返す","もりかえす","v5s|vt","lấy lại đà | hồi phục | trở lại phong độ","to rally | to make a comeback","1379720"),
    ("取って返す","とってかえす","v5s|vi","quay trở lại | quay đầu về","to return","1707600"),
    ("裏返る","うらがえる","v5r|vi","lộn trái | trở mặt | phản bội | vỡ giọng (the thé)","to be turned inside out | to betray | to break into falsetto","1550640"),
    ("転がす","ころがす","v5s|vt","lăn | đẩy lăn | lật đổ | mua đi bán lại","to roll | to wheel | to tip over | to buy and sell (for profit)","1440980"),
    ("ずらす","ずらす","v5s|vt","xê dịch | dời | trượt đi | dời lịch | lệch giờ","to shift | to move | to delay | to stagger (hours)","1006420"),
    ("ずれる","ずれる","v1|vi","trượt | xê dịch | lệch | sai lệch | lạc đề","to slide | to be out of alignment | to deviate","1006460"),
    ("ねじ曲げる","ねじまげる","v1|vt","vặn cong | bẻ cong | xuyên tạc | bóp méo","to twist | to contort | to distort (the truth)","1567480"),
    ("へし折る","へしおる","v5r|vt","bẻ gãy | đập gãy | bẻ vụn","to smash | to break","1152910"),
    ("ぶっ壊す","ぶっこわす","v5s|vt","đập phá | phá nát | làm hỏng | phá đám","to destroy | to smash | to ruin | to wreck","2215920"),
    ("ぶち壊す","ぶちこわす","v5s|vt","đập phá | phá nát | phá hỏng | làm tan tành","to destroy | to smash | to ruin | to wreck","1408630"),
    ("打ち砕く","うちくだく","v5k|vt","đập vỡ | nghiền nát | đập tan | diễn giải đơn giản","to smash | to shatter | to crush | to simplify","1408660"),
    ("踏みにじる","ふみにじる","v5r|vt","giẫm đạp | chà đạp | giày xéo","to trample underfoot | to crush with a foot","1450260"),
    ("踏み潰す","ふみつぶす","v5s|vt","giẫm bẹp | đạp nát | giẫm nát","to trample | to crush underfoot","1847820"),
    ("握りつぶす","にぎりつぶす","v5s|vt","bóp nát | ém nhẹm | xếp xó (đề xuất) | bưng bít","to crush (with hands) | to shelve | to smother (a proposal)","1599820"),
    ("塗りつぶす","ぬりつぶす","v5s|vt","tô kín | phủ kín | bôi đen | sơn phủ hết","to paint over | to fill in | to cover completely","1444240"),
    ("塗りたくる","ぬりたくる","v5r|vt","bôi trát | quệt loạn | bôi dày","to bedaub | to paint heavily | to spread thickly","2012470"),
    ("植え付ける","うえつける","v1|vt","trồng | cấy | gieo (ý nghĩ, cảm xúc)","to plant | to transplant | to instil (idea)","1587990"),
    ("焼き付ける","やきつける","v1|vt","nung in (gốm) | khắc sâu (ký ức) | in (ảnh) | mạ","to bake (a design) | to burn into (memory) | to print","1350700"),
    ("縛り付ける","しばりつける","v1|vt","trói chặt | buộc chặt | ghì giữ | gò bó","to tie | to restrain | to bind | to fasten","1476040"),
    ("痛めつける","いためつける","v1|vt","hành hạ | trừng phạt | đối xử tàn nhẫn | đánh đập","to torment | to treat harshly | to beat up","1432730"),
    ("投げつける","なげつける","v1|vt","ném vào | quăng vào | trút (lời lẽ nặng nề)","to throw at | to hurl at | to hurl (abuse)","1447350"),
    ("吹き付ける","ふきつける","v1|vt","thổi tạt vào | phun (sơn) lên bề mặt","to blow against | to spray (paint) onto","1602510"),
    ("照りつける","てりつける","v1|vi","nắng chói chang | nắng gay gắt | rọi gắt","to blaze down on | to beat down on","1350980"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
