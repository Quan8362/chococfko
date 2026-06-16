# -*- coding: utf-8 -*-
"""Build N2 ready wave 021 — native Japanese verbs (wago)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-021.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("誓う","ちかう","v5u|vt","thề | thề nguyện | tuyên thệ | cam kết","to swear | to vow | to take an oath | to pledge","1381210"),
    ("拭う","ぬぐう","v5u|vt","lau | chùi | xóa bỏ (ấn tượng, cảm giác)","to wipe | to mop up | to get rid of | to erase","1357220"),
    ("先んじる","さきんじる","v1|vi","đi trước | đón đầu | làm trước một bước","to precede | to forestall | to anticipate","1387330"),
    ("甘やかす","あまやかす","v5s|vt","nuông chiều | chiều chuộng | làm hư","to pamper | to spoil","1213470"),
    ("明かす","あかす","v5s|vt","thức trắng (đêm) | tiết lộ | thổ lộ | chứng minh","to pass (the night) | to reveal | to disclose","1532220"),
    ("生かす","いかす","v5s|vt","tận dụng | phát huy | để sống | cứu sống","to make use of | to put to good use | to keep alive","1587070"),
    ("唆す","そそのかす","v5s|vt","xúi giục | dụ dỗ | kích động","to instigate | to entice | to incite","1290790"),
    ("醸す","かもす","v5s|vt","ủ (rượu) | gây ra | tạo nên | làm dấy lên","to brew | to cause | to bring about | to give rise to","1357070"),
    ("萎える","なえる","v1|vi","mất sức | yếu đi | héo rũ | nản lòng | cụt hứng","to lose strength | to wither | to feel demotivated","1158670"),
    ("賜る","たまわる","v5r|vt","được ban tặng | được ban cho | ban cho | bệ hạ ban","to be given | to be granted | to bestow | to confer","1312860"),
    ("強がる","つよがる","v5r|vi","làm ra vẻ mạnh mẽ | tỏ vẻ cứng cỏi | thùng rỗng kêu to","to pretend to be tough | to put on a brave front | to bluff","1928800"),
    ("惜しむ","おしむ","v5m|vt","tiếc | tiếc rẻ | hà tiện | luyến tiếc | trân quý","to grudge | to regret | to be reluctant | to cherish","1382300"),
    ("企む","たくらむ","v5m|vt","mưu tính | âm mưu | bày mưu | toan tính","to scheme | to plan | to conspire","1218140"),
    ("富む","とむ","v5m|vi","giàu (về) | dồi dào | phong phú | giàu có","to be rich (in) | to abound (in) | to be wealthy","1496740"),
    ("嗜む","たしなむ","v5m|vt","ưa thích | có sở thích | thưởng thức điều độ | thận trọng","to have a taste for | to enjoy (in moderation) | to be prudent","2008820"),
    ("治める","おさめる","v1|vt","cai trị | trị vì | quản lý | dẹp yên | dàn xếp","to rule | to govern | to manage | to quell | to settle","1316830"),
    ("収める","おさめる","v1|vt|suf","cất giữ | thu vào | đạt được | giành | thu (lợi nhuận)","to put away | to store | to achieve | to obtain | to gain","1589090"),
    ("静める","しずめる","v1|vt","làm yên | trấn an | xoa dịu | dẹp loạn | làm lắng","to quieten | to calm | to appease | to suppress | to soothe","1594280"),
    ("辱める","はずかしめる","v1|vt","làm nhục | sỉ nhục | bôi nhọ | xâm hại","to humiliate | to disgrace | to insult | to violate","1358750"),
    ("貶める","おとしめる","v1|vt","coi thường | rẻ rúng | hạ thấp | làm suy đồi","to show contempt for | to look down upon | to cause to fall","2075800"),
    ("仕留める","しとめる","v1|vt","hạ gục | bắn hạ | giết | hạ thủ","to bring down | to kill | to shoot dead","1305630"),
    ("取り締まる","とりしまる","v5r|vt","quản lý | kiểm soát | giám sát | trấn áp | xử lý","to manage | to supervise | to crack down on | to regulate","1326860"),
    ("引き締まる","ひきしまる","v5r|vi","căng lên | săn chắc | siết chặt | căng thẳng","to become tense | to be tightened | to become firm","1169030"),
    ("固める","かためる","v1|vt","làm cứng | củng cố | gom lại | làm vững | quyết tâm","to harden | to strengthen | to consolidate | to fortify","1266570"),
    ("覚める","さめる","v1|vi","tỉnh giấc | thức tỉnh | tỉnh (rượu, thuốc) | vỡ mộng","to wake up | to sober up | to come to one's senses","1206070"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
