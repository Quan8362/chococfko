# -*- coding: utf-8 -*-
"""Build N1 ready wave 071 — compound verbs (set 71)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-071.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("取りまとめる","とりまとめる","v1|vt","tổng hợp | thu thập | tập hợp | dàn xếp | sắp xếp ổn thỏa","to gather | to compile | to arrange | to settle","1659460"),
    ("取り憑く","とりつく","v5k|vi","ám | nhập (hồn ma) | ám ảnh | bám lấy | đeo bám tâm trí","to possess (of a spirit) | to haunt | to take hold of","2648790"),
    ("取り散らかす","とりちらかす","v5s|vt","bày bừa | làm lộn xộn | vứt bừa bãi | bừa bộn (đồ đạc)","to scatter about | to leave untidy | to mess up","2869765"),
    ("押し黙る","おしだまる","v5r|vi","im bặt | lặng thinh | nín thinh | giữ im lặng","to keep silent","1180400"),
    ("押し通す","おしとおす","v5s|vt","làm theo ý mình | khăng khăng | làm tới cùng | bất chấp ép buộc tới cùng","to persist in | to push through | to have one's own way","1180290"),
    ("差し迫る","さしせまる","v5r|vi","cận kề | sắp xảy ra | cấp bách | nguy cấp | gấp gáp","to be imminent | to be impending | to be urgent","1850030"),
    ("差し障る","さしさわる","v5r|vi","cản trở | gây trở ngại | ảnh hưởng xấu | làm vướng","to hinder | to obstruct | to adversely affect","1291260"),
    ("差し挟む","さしはさむ","v5m|vt","chen vào | nói xen | ôm (nghi ngờ) | nuôi (ý nghĩ) | kẹp vào","to insert | to interrupt | to harbor (doubts)","1850040"),
    ("差し向ける","さしむける","v1|vt","cử đi | phái đến | điều (người/xe) | hướng (sự chú ý) tới","to send | to dispatch | to direct (attention)","1849970"),
    ("立ち振る舞う","たちふるまう","v5u","cư xử | hành xử | ứng xử | đi đứng cử chỉ","to act | to behave","1551400"),
    ("打ちのめす","うちのめす","v5s|vt","đánh gục | hạ đo ván | đánh tơi tả | giáng đòn chí mạng | làm suy sụp","to knock down | to crush | to devastate (emotionally)","1581430"),
    ("引き立てる","ひきたてる","v1|vt","làm nổi bật | tôn lên | nâng đỡ | đề bạt | cổ vũ | áp giải (tù)","to enhance | to support | to promote | to march off (a prisoner)","1601640"),
    ("引っ込める","ひっこめる","v1|vt","rút lại | thu lại | co vào | rụt vào | rút lui (lời nói)","to retract | to withdraw | to take back (words)","1169400"),
    ("食ってかかる","くってかかる","v5r|vi","gây gổ | sừng sộ | phản kháng dữ dội | lao vào cãi | bật lại","to lash out at | to flare up at | to turn on","1852350"),
    ("繰り広げる","くりひろげる","v1|vt","mở ra | trải ra | diễn ra (sôi nổi) | giăng ra | triển khai","to unfold | to unroll | to open up","1246950"),
    ("切り盛り","きりもり","n|vs|vt","quán xuyến | điều hành | xoay xở quản lý | đảm đương | thu vén","management (of a house/store) | running","1384340"),
    ("切り崩す","きりくずす","v5s|vt","san bằng (đất) | đào xuyên (núi) | chia rẽ (phe đối lập) | phá vỡ (đình công) | làm suy yếu","to level (earth) | to split (the opposition)","1384700"),
    ("踏みとどまる","ふみとどまる","v5r|vi","trụ lại | đứng vững | cầm cự | kìm lại không làm | dừng bước","to stay on | to hold one's ground | to stop oneself","1450160"),
    ("見せびらかす","みせびらかす","v5s|vt","khoe khoang | phô trương | trưng ra để khoe | làm dáng khoe của","to show off | to flaunt","1259200"),
    ("見くびる","みくびる","v5r|vt","coi thường | đánh giá thấp | xem nhẹ | khinh thường | dòm ngó","to underrate | to belittle | to look down on","1259170"),
    ("見据える","みすえる","v1|vt","nhìn chằm chằm | nhìn thẳng | nhìn về (tương lai) | xác định rõ | hướng tầm nhìn","to stare fixedly at | to set one's eyes on | to focus on","1259750"),
    ("見繕う","みつくろう","v5u|vt","tự chọn giúp | chọn lựa theo ý mình | tùy ý lựa hàng | chọn hộ","to choose at one's discretion","1641740"),
    ("見せつける","みせつける","v1|vt","phô bày | khoe ra | trưng ra cho thấy | thị uy | cố tình cho xem","to make a display of | to show off | to flaunt","1259230"),
    ("聞き入れる","ききいれる","v1|vt","chấp thuận | nghe theo | đáp ứng (lời thỉnh cầu) | nghe lời | tiếp thu","to grant (a wish) | to comply with | to heed","1505880"),
    ("聞き分ける","ききわける","v1|vt","phân biệt qua âm thanh | nghe ra | nhận biết bằng tai | biết nghe lời phải","to identify by sound | to listen to reason","1505920"),
    ("振りかざす","ふりかざす","v5s|vt","vung lên (kiếm) | giương cao | huơ | nêu cao (nguyên tắc) | lấy (quyền) ra ép","to brandish | to wield (power) | to proclaim (principles)","1602940"),
    ("仕立て上げる","したてあげる","v1|vt","dựng nên | đào tạo thành | gán cho | dàn dựng | biến ai thành (cái gì)","to make out to be | to set someone up | to frame","1850810"),
    ("住み慣れる","すみなれる","v1|vi","quen sống (ở đâu) | ở lâu thành quen | gắn bó nơi ở | sống lâu năm","to get used to living in | to live somewhere long","1333940"),
    ("住み込む","すみこむ","v5m|vi","ở trọ (nhà chủ) | sống nội trú | làm người ở | ăn ở tại chỗ làm","to live in (one's employer's house) | to be a live-in","1333960"),
    ("吹き飛ばす","ふきとばす","v5s|vt","thổi bay | thổi tung | xua tan | đánh bay | nói khoác lác","to blow away | to dispel | to talk big","1370690"),
    ("突き放す","つきはなす","v5s|vt","đẩy ra | hắt hủi | ruồng bỏ | lạnh lùng cự tuyệt | bỏ xa (đối thủ)","to push away | to forsake | to act coldly","1597840"),
    ("突き詰める","つきつめる","v1|vt","truy đến cùng | điều tra cặn kẽ | đào sâu suy nghĩ | nghiền ngẫm | ám ảnh","to investigate thoroughly | to get to the bottom of","1456610"),
    ("突きつける","つきつける","v1|vt","chìa ra trước mặt | dí (súng) | đưa ra (bằng chứng) | gí thẳng vào | đập vào mặt","to thrust at | to point (a gun) | to confront with","1456850"),
    ("突っ走る","つっぱしる","v5r|vi","phóng nhanh | lao vút | chạy bán mạng | lao về phía trước | bất chấp tiến lên","to run swiftly | to dash | to charge ahead","1456950"),
    ("照らし合わせる","てらしあわせる","v1|vt","đối chiếu | so sánh | kiểm tra chéo | dò lại | rà soát","to check (against) | to compare","1847590"),
    ("泣き崩れる","なきくずれる","v1|vi","khóc nức nở | gục xuống khóc | khóc đến rũ rượi | òa khóc","to break down crying","1229800"),
    ("投げ売り","なげうり","n|vs|vt","bán tháo | bán đổ bán tháo | bán lỗ | bán xả hàng | bán đại hạ giá","a sacrifice sale | selling at a loss | dumping","1653090"),
    ("慣れ親しむ","なれしたしむ","v5m|vi","gắn bó thân thuộc | quen thuộc yêu mến | thân quen | làm quen và yêu thích","to become familiar with and cherish","1899490"),
    ("練り上げる","ねりあげる","v1|vt","nhào kỹ | trau chuốt | gọt giũa hoàn thiện | mài giũa (ý tưởng)","to knead well | to polish | to refine","1559120"),
    ("寝そべる","ねそべる","v5r|vi","nằm dài | nằm duỗi | nằm ườn | nằm phưỡn ra | nằm nghiêng thư giãn","to sprawl | to lie sprawled | to stretch oneself out","1359990"),
    ("願い出る","ねがいでる","v1|vt","xin phép | đệ đơn | nộp đơn xin | thỉnh cầu | làm đơn (xin từ chức)","to apply for | to file a request for","1217940"),
    ("逃げ延びる","にげのびる","v1|vi","trốn thoát an toàn | đào thoát thành công | chạy thoát thân | tẩu thoát","to escape to safety | to make good one's escape","1450340"),
    ("握り締める","にぎりしめる","v1|vt","nắm chặt | siết chặt | bóp chặt trong tay | nắm chặt lấy","to grasp tightly","1152700"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
