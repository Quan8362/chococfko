# -*- coding: utf-8 -*-
"""Build N1 ready wave 006 — literary 〜たる adjectives + formal verbs (set 6)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-006.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("堂々","どうどう","adj-t|adv-to","đường hoàng | uy nghi | hùng dũng | đĩnh đạc | ngang nhiên","magnificent | dignified | majestic | imposing | boldly","1599260"),
    ("洋々","ようよう","adj-t|adv-to","mênh mông | bao la | rộng lớn | thênh thang (tiền đồ)","broad | vast | boundless | wide","1794460"),
    ("悠々","ゆうゆう","adj-t|adv-to|adv","ung dung | thong dong | thư thái | thảnh thơi | vô tận","leisurely | calm | composed | comfortably | boundless","1605700"),
    ("赫々","かくかく","adj-t|adv-to","rực rỡ | chói lọi | huy hoàng | hiển hách","brilliant | bright | glorious","1590000"),
    ("朗々","ろうろう","adj-t|adv-to","sang sảng | vang vọng | trong trẻo | ngân vang","clear | sonorous | resonant","1606460"),
    ("忽然","こつぜん","adj-t|adv-to","đột nhiên | bỗng dưng | thoắt cái | bất chợt","sudden | abrupt | unexpected","1722410"),
    ("燦然","さんぜん","adj-t|adv-to","lấp lánh | rạng rỡ | rực sáng | lung linh","brilliant | radiant | sparkling","1303690"),
    ("陶然","とうぜん","adj-t|adv-to","lâng lâng | ngất ngây | say sưa | mê mẩn","tipsy | mellow | entranced | captivated","1717210"),
    ("喫緊","きっきん","adj-no|adj-na|n","cấp thiết | cấp bách | bức thiết","urgent | pressing | exigent","1715170"),
    ("赤裸々","せきらら","adj-na|n","trần trụi | thẳng thắn | bộc trực | không che giấu","naked | unvarnished | frank | candid","1596080"),
    ("紛らわす","まぎらわす","v5s|vt","khuây khỏa | đánh lạc hướng | giải khuây | che giấu (cảm xúc)","to divert (one's mind) | to distract | to conceal (grief)","1505000"),
    ("惑わす","まどわす","v5s|vt","mê hoặc | làm bối rối | lừa gạt | dụ dỗ | quyến rũ","to bewilder | to perplex | to delude | to seduce","1562580"),
    ("弱る","よわる","v5r|vi","yếu đi | suy nhược | sa sút | nản lòng | bối rối","to weaken | to decline (health) | to be troubled | to be at a loss","1324650"),
    ("廃る","すたる","v5r|vi","lỗi thời | lụi tàn | mai một | tổn hại (danh dự)","to become obsolete | to die out | to be hurt (reputation)","1472010"),
    ("据わる","すわる","v5r|vi","đứng yên | vững vàng | điềm tĩnh | cố định (ánh mắt)","to hold steady | to calm down | to become fixed (gaze)","2868912"),
    ("背く","そむく","v5k|vi","trái lệnh | đi ngược | phản bội | vi phạm","to go against | to disobey | to run counter to","1472680"),
    ("逸れる","それる","v1|vi","chệch hướng | trượt khỏi | lạc đề | đi lệch","to veer away | to swerve | to miss (target) | to digress","1576360"),
    ("鈍る","にぶる","v5r|vi","cùn đi | chậm lại | sa sút | yếu đi | chùn bước","to become blunt | to grow dull | to weaken | to falter","1582440"),
    ("睨む","にらむ","v5m|vt","trừng mắt | quắc mắt | dò xét | phán đoán | để mắt tới","to glare at | to scowl at | to estimate | to keep an eye on","1569880"),
    ("秘める","ひめる","v1|vt","giấu kín | ấp ủ | ẩn chứa | cất giữ trong lòng","to hide | to keep to oneself","1483980"),
    ("翻る","ひるがえる","v5r|vi","phấp phới | tung bay | lật ngược | thay đổi đột ngột","to flutter | to wave | to suddenly change (opinion)","1523350"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
