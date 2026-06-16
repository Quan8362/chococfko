# -*- coding: utf-8 -*-
"""Build N1 ready wave 002 — formal Sino-Japanese nouns/verbs (set 2)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-002.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("災い","わざわい","n","tai họa | tai ương | điều bất hạnh | hoạn nạn","disaster | calamity | misfortune","1295080"),
    ("災難","さいなん","n","tai nạn | tai ương | hoạn nạn","calamity | misfortune | disaster","1295110"),
    ("猜疑","さいぎ","n|vs|vt","nghi kỵ | ngờ vực | ghen ghét","suspicion | jealousy","1569290"),
    ("惨事","さんじ","n","thảm họa | thảm kịch | tai nạn thảm khốc","disaster | tragedy | horrible accident","1303340"),
    ("散漫","さんまん","adj-na|n","lan man | lơ đãng | rời rạc | tản mạn","vague | desultory | distracted | scattered","1303630"),
    ("挫折","ざせつ","n|vs|vi","thất bại | gãy đổ giữa chừng | nản chí | vấp ngã","setback | failure | frustration | discouragement","1292040"),
    ("殺到","さっとう","n|vs|vi","đổ xô | ùa tới | dồn dập | tới tấp","rush | flood | deluge","1299190"),
    ("雑踏","ざっとう","n|vs|vi|adj-no","đám đông chen chúc | sự náo nhiệt | tắc nghẽn","hustle and bustle | throng | crowd | congestion","1594020"),
    ("嗜好","しこう","n|vs|vt","sở thích | thị hiếu | gu","taste | liking | preference","1565500"),
    ("志向","しこう","n|vs|vt","khuynh hướng | định hướng | hướng tới (mục tiêu)","intention | aim | orientation (towards a goal)","1309110"),
    ("指向","しこう","n|vs|vt|adj-no","hướng về | định hướng | có tính định hướng (vd micro)","being orientated towards | directional | -oriented","1309770"),
    ("至急","しきゅう","adj-no|n|adv","khẩn cấp | gấp | ngay lập tức | cấp tốc","urgent | pressing | immediate | at once","1311900"),
    ("時宜","じぎ","n","đúng thời điểm | hợp thời | đúng lúc","right time | appropriate time","1316090"),
    ("持参","じさん","n|vs|vt","mang theo | đem theo | tự mang đến","bringing | taking | carrying","1315790"),
    ("失墜","しっつい","n|vs|vt|vi","đánh mất (uy tín) | sa sút | suy giảm (danh tiếng)","abasement | fall | forfeiture | sinking in estimation","1320090"),
    ("疾患","しっかん","n","bệnh tật | bệnh lý | chứng bệnh","disease | illness | disorder | ailment","1320580"),
    ("叱責","しっせき","n|vs|vt","khiển trách | quở trách | trách mắng","reprimand | rebuke | scolding","1319590"),
    ("執念","しゅうねん","n","sự cố chấp | nỗi ám ảnh | quyết tâm dai dẳng","tenacity | persistence | obsession","1319690"),
    ("醜態","しゅうたい","n","hành vi đáng hổ thẹn | bộ dạng nhục nhã","disgraceful behavior | shameful conduct","1333830"),
    ("潤沢","じゅんたく","adj-na|n","dồi dào | phong phú | sung túc | bóng mượt","abundant | ample | plentiful | lustrous","1635870"),
    ("消去","しょうきょ","n|vs|vt","xóa bỏ | tẩy xóa | loại trừ | khử","erasure | deletion | elimination | clearing","1350190"),
    ("処遇","しょぐう","n|vs|vt","sự đối đãi | cách đối xử (với người) | chế độ đãi ngộ","treatment (of a person) | dealing with","1342420"),
    ("進呈","しんてい","n|vs|vt","kính tặng | biếu | tặng (quà)","presentation (of a gift)","1366150"),
    ("親睦","しんぼく","n|vs|vi","sự thân mật | tình hữu nghị | giao hảo","friendship | amity","1365370"),
    ("迅速","じんそく","adj-na|n","nhanh chóng | mau lẹ | tốc độ | tức thì","quick | rapid | swift | prompt","1370160"),
    ("拗ねる","すねる","v1|vi","hờn dỗi | giận dỗi | bĩu môi","to be peevish | to sulk | to pout","1567260"),
    ("誓約","せいやく","n|vs|vt","thề | cam kết | tuyên thệ | giao ước","oath | vow | pledge | covenant","1381260"),
    ("制裁","せいさい","n|vs|vt","trừng phạt | chế tài | cấm vận","sanctions | punishment","1374800"),
    ("逝去","せいきょ","n|vs|vi","qua đời | tạ thế | từ trần","death | passing","1381360"),
    ("拙劣","せつれつ","adj-na|n","vụng về | kém cỏi | lóng ngóng","clumsy | unskillful","1385330"),
    ("潜在","せんざい","n|vs|vi","tiềm ẩn | tiềm tàng | ngủ yên | tiềm năng","potentiality | dormancy | latency","1391310"),
    ("扇動","せんどう","n|vs|vt","kích động | xúi giục | xách động | gây rối","incitement | sedition | agitation","1390750"),
    ("善処","ぜんしょ","n|vs|vt","xử lý thỏa đáng | giải quyết ổn thỏa | liệu cách","dealing appropriately | taking proper measures","1394420"),
    ("疎遠","そえん","n|adj-na|adj-no","xa cách | lạnh nhạt | ít liên lạc","estrangement | alienation","1396680"),
    ("遭遇","そうぐう","n|vs|vi","chạm trán | gặp phải | đối mặt (với sự cố)","encounter | running into | being confronted with","1402890"),
    ("創意","そうい","n","ý tưởng độc đáo | sáng kiến | tính sáng tạo","original idea | originality","1398290"),
    ("喪失","そうしつ","n|vs|vt","mất mát | đánh mất | tước mất","loss | forfeit","1399290"),
    ("疎通","そつう","n|vs|vi","sự thông hiểu lẫn nhau | thông suốt | thông tỏ","mutual understanding | communication","1396750"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
