# -*- coding: utf-8 -*-
"""Build N1 ready wave 065 — literary verbs (set 65)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-065.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("嬲る","なぶる","v5r|vt","trêu chọc | giễu cợt | hành hạ | đùa bỡn | chế nhạo | mân mê","to tease | to make fun of | to play with","1566180"),
    ("擦る","なする","v5r|vt","bôi | quệt | trét | phết lên | đổ vạ | đổ lỗi","to rub in | to smear on | to lay the blame on","2086270"),
    ("宥める","なだめる","v1|vt","dỗ dành | xoa dịu | trấn an | làm nguôi | vỗ về","to soothe | to calm | to pacify","1540250"),
    ("雪崩れる","なだれる","v1|vi","đổ ào xuống | trượt (tuyết) | dốc xuống | ùa xuống","to slope | to slide (snow) | to descend","1249440"),
    ("均す","ならす","v5s|vt","san bằng | làm phẳng | san đều | tính trung bình | làm nhẵn","to make even | to flatten | to average","1241240"),
    ("匂わす","におわす","v5s|vt","tỏa hương | bóng gió | ám chỉ | gợi ý xa xôi | ngụ ý","to give off a scent | to hint at | to insinuate","1463460"),
    ("逃げ惑う","にげまどう","v5u|vi","chạy tán loạn | hốt hoảng tìm đường thoát | chạy nháo nhào | chạy toán loạn","to run about frantically trying to escape","1450420"),
    ("惚ける","とぼける","v1|vi","giả vờ ngơ | giả ngây | làm bộ không biết | đãng trí | ngẩn ngơ","to play dumb | to feign ignorance | to play the fool","1610900"),
    ("抜きん出る","ぬきんでる","v1|vi","vượt trội | nổi bật hẳn | xuất chúng | hơn hẳn | vượt lên trên","to surpass | to excel | to stand out","1478140"),
    ("塗れる","まみれる","v1|vi","bê bết | lấm lem | dính đầy | bám đầy | be bét (血に塗れる)","to be smeared | to be covered (in)","1444280"),
    ("捻る","ひねる","v5r|vt","vặn | xoắn | trẹo | bóp | đánh bại dễ dàng | nghĩ ra (câu đố) | làm phức tạp","to twist | to sprain | to make intricate | to defeat easily","1469530"),
    ("燻す","いぶす","v5s|vt","hun khói | xông khói | un | xông trừ (côn trùng) | làm xỉn (kim loại)","to smoke | to fumigate | to oxidize","1949270"),
    ("覗き込む","のぞきこむ","v5m|vt","ngó vào | nhìn chăm chú vào | dòm vào | ghé mắt nhìn","to look into | to peer into","1470830"),
    ("宣う","のたまう","v5u|vt","phán | dạy rằng | (mỉa) phán bảo | thốt lời (kính ngữ mỉa mai)","to say | to be pleased to say","2842102"),
    ("延べる","のべる","v1|vt","trải (chăn đệm) | dọn (giường) | trải rộng | kéo dài | hoãn lại","to lay out (a futon) | to spread out | to postpone","1176390"),
    ("退っ引きならない","のっぴきならない","adj-i","không thể tránh | bất khả kháng | tiến thoái lưỡng nan | cấp bách không lối thoát","unavoidable | inescapable | hopeless","1411280"),
    ("生やす","はやす","v5s|vt","để mọc | nuôi (râu tóc) | trồng | để cho mọc (cỏ dại)","to grow | to cultivate | to let grow","1378760"),
    ("腫らす","はらす","v5s|vt","làm sưng | khiến sưng tấy | làm viêm | sưng vù (mắt) (泣き腫らす)","to cause to swell | to inflame","2038860"),
    ("怯む","ひるむ","v5m|vi","chùn bước | nao núng | rụt lại | nhụt chí | e dè | nản lòng","to flinch | to recoil | to be daunted","1236640"),
    ("吹きすさぶ","ふきすさぶ","v5b|vi","gió gào thét | gió thổi dữ dội | gió rít từng cơn | thổi vi vu","to blow fiercely | to rage (of wind)","1846490"),
    ("膨らます","ふくらます","v5s|vt","làm phồng | bơm căng | thổi phồng | làm phình ra | nong rộng","to swell | to inflate | to expand","1519970"),
    ("紛れ込む","まぎれこむ","v5m|vi","lẫn vào | trà trộn vào | lạc vào | bị lẫn lộn | lọt vào","to slip into | to be mixed up with | to be lost among","1505020"),
    ("申し添える","もうしそえる","v1|vt","nói thêm | bổ sung | xin nói thêm | thêm vài lời (kính ngữ)","to add (to what was said) | to say in addition","1362980"),
    ("燃え盛る","もえさかる","v5r|vi","cháy rực | bừng cháy | cháy ngùn ngụt | rực lửa","to blaze | to burn brightly","1851620"),
    ("潜り込む","もぐりこむ","v5m|vi","chui vào | lẻn vào | trốn vào | luồn vào | trà trộn xâm nhập","to slip into | to crawl into | to sneak into","1391280"),
    ("持て余す","もてあます","v5s|vt","không biết xử lý sao | lúng túng | bó tay | khó kham | thừa thãi khó dùng","to be too much for one | to not know what to do with","1315750"),
    ("弥","いや","adv","ngày càng | càng thêm | hết sức | vô cùng (弥が上にも)","more and more | increasingly | extremely","2580180"),
    ("削ぐ","そぐ","v5g|vt","gọt | vạt | xén | làm cùn (hứng thú) | giảm bớt | làm suy yếu","to shave off | to dampen (enthusiasm) | to diminish","1298040"),
    ("唆る","そそる","v5r|vt","khơi gợi | kích thích | gợi (thèm/tò mò) | lôi cuốn | khêu gợi","to excite | to stimulate | to arouse | to tempt","1006750"),
    ("逸らす","そらす","v5s|vt","quay đi (mắt) | né tránh | lảng tránh | chuyển hướng | làm phật ý | đánh trượt","to avert | to divert | to evade | to displease","1167650"),
    ("戦ぐ","そよぐ","v5g|vi","xào xạc | đong đưa | lay động nhẹ | rung rinh | phất phơ","to rustle | to sway | to flutter","2008720"),
    ("逸れる","はぐれる","v1|vi","lạc mất (đồng hành) | đi lạc | tách khỏi | lỡ mất (cơ hội)","to lose sight of (companions) | to stray from","2801130"),
    ("矯める","ためる","v1|vt","uốn thẳng | sửa | nắn lại | chữa (tật) | làm giả (矯めつ眇めつ)","to straighten | to correct | to cure","1237770"),
    ("湛える","たたえる","v1|vt","chứa đầy | tràn đầy | ngập tràn | phô (nụ cười) | lộ rõ (cảm xúc)","to fill (with) | to be brimming | to wear (a smile)","1982910"),
    ("祟る","たたる","v5r|vi","gây tai họa | ám | quở phạt | báo oán | gây hậu quả xấu","to curse | to haunt | to bring about a bad result","1570090"),
    ("質す","ただす","v5s|vt","hỏi rõ | chất vấn | hỏi cho ra lẽ | xác minh | gặng hỏi","to ask | to inquire | to make sure of","1320660"),
    ("糺す","ただす","v5s|vt","làm sáng tỏ | xác minh | điều tra cho rõ | truy xét sự thật","to ascertain | to verify | to confirm","1610220"),
    ("慈しむ","いつくしむ","v5m|vt","yêu thương | trìu mến | nâng niu | thương yêu trân quý | đối xử dịu dàng","to be affectionate towards | to treat tenderly | to love","1315280"),
    ("窄める","すぼめる","v1|vt","thu hẹp | khép lại | cụp (ô) | rụt (vai) | mím (môi) | bóp nhỏ","to make narrower | to close (an umbrella) | to purse (lips)","1579280"),
    ("窄まる","すぼまる","v5r|vi","hẹp dần | thu hẹp lại | co lại | khép lại","to get narrower | to contract","2036930"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
