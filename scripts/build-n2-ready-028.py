# -*- coding: utf-8 -*-
"""Build N2 ready wave 028 — adverbs, degree/time expressions, humble/honorific verbs."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-028.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("意外","いがい","adj-na|adv-to|n","bất ngờ | không ngờ | ngoài dự kiến","unexpected | surprising","1156410"),
    ("存外","ぞんがい","adj-na|adj-no|adv|n","ngoài dự đoán | trái với mong đợi | bất ngờ","beyond expectation | unexpectedly","1653800"),
    ("殊更","ことさら","adv|adj-na","cố tình | cố ý | nhất là | đặc biệt","intentionally | deliberately | especially","1328690"),
    ("殊に","ことに","adv","đặc biệt | nhất là | hơn nữa","especially | particularly | above all","1328650"),
    ("別に","べつに","adv","không có gì đặc biệt | riêng ra | thêm","(not) particularly | separately | additionally","1509480"),
    ("無性に","むしょうに","adv","cực kỳ | vô cùng | không kìm được | tự dưng","very much | intensely | irresistibly","1611900"),
    ("矢鱈","やたら","adv|adv-to|adj-na","bừa bãi | lung tung | quá mức | vô tội vạ","indiscriminately | recklessly | excessively","1537780"),
    ("無闇","むやみ","adj-na|n|adv-to","khinh suất | bừa bãi | thái quá | vô lý","thoughtless | reckless | indiscriminate | excessive","1673310"),
    ("折角","せっかく","adv|n|adj-no","cất công | khó khăn lắm mới | quý báu | mong chờ đã lâu","with trouble | at great pains | long-awaited | precious","1596090"),
    ("偶","たま","adj-no|adj-na|n","thỉnh thoảng | hiếm hoi | họa hoằn","occasional | infrequent | rare","2068840"),
    ("追々","おいおい","adv","dần dần | từ từ | từng bước","gradually | by degrees | step by step","2531700"),
    ("徐々","じょじょ","adj-t|adv-to","từ từ | chậm rãi | đều đặn | điềm tĩnh","slow | gradual | steady | composed","1345600"),
    ("刻一刻","こくいっこく","adv|adv-to","từng giờ từng phút | từng khoảnh khắc","moment by moment | hour by hour","1285900"),
    ("日増し","ひまし","n","tăng theo ngày | ngày một nhiều thêm","increasing daily | increasing day by day","1464240"),
    ("日に日に","ひにひに","adv","ngày qua ngày | mỗi ngày | từng ngày","day by day | daily | every day","1611380"),
    ("益々","ますます","adv","càng ngày càng | ngày càng | hơn nữa","increasingly | more and more","1603950"),
    ("未だ","まだ","adv|adj-na","vẫn còn | chưa | mới chỉ | tương đối","still | as yet | (not) yet | comparatively","1527110"),
    ("今や","いまや","adv","giờ đây | bây giờ (so với trước) | ngay lúc này","now (esp. in contrast to the past) | right now","1289000"),
    ("最早","もはや","adv","đã | giờ thì | không còn nữa | chẳng còn","already | now | no longer | not any more","1294170"),
    ("嘗て","かつて","adv|adj-no","đã từng | trước kia | từng | chưa từng","once | formerly | ever | former | never before","1581210"),
    ("追って","おって","adv|conj","sau này | ít lâu nữa | rồi sẽ | tái bút","later on | shortly | in due course | P.S.","1852860"),
    ("遅かれ早かれ","おそかれはやかれ","exp|adv","sớm muộn gì | trước sau gì","sooner or later","1705660"),
    ("遠からず","とおからず","adv","chẳng bao lâu nữa | sắp tới | trong tương lai gần","soon | before long | in the near future","1177810"),
    ("間もなく","まもなく","adv","chẳng mấy chốc | sắp | không lâu nữa | không kịp","soon | shortly | before long","1215290"),
    ("程なく","ほどなく","adv","chẳng bao lâu | ít lâu sau | không lâu sau đó","soon | before long | shortly thereafter","1436520"),
    ("即座に","そくざに","adv","ngay lập tức | tức thì | tại chỗ","immediately | right away | on the spot","1404190"),
    ("一挙に","いっきょに","adv","một mạch | trong một lần | cùng một lúc","at a stroke | with a single swoop","1609220"),
    ("概して","がいして","adv","nhìn chung | nói chung | đại thể","generally | as a rule","1204400"),
    ("総じて","そうじて","adv","nói chung | tổng thể | nhìn toàn cục","in general | as a whole | all in all","2011980"),
    ("軒並み","のきなみ","n|adv","dãy nhà | nhà nào cũng | tất cả | đồng loạt","row of houses | every house | across the board","1260380"),
    ("揃って","そろって","exp","tất cả cùng | đồng loạt | cùng nhau | đông đủ","all together | in a body | en masse","1890210"),
    ("大抵","たいてい","adj-na|adv|n|adj-no","thường thường | đa phần | hầu hết | có lẽ","mostly | usually | generally | probably","1414580"),
    ("大概","たいがい","adv|adj-no|n","đại khái | phần lớn | hầu hết | vừa phải | có lẽ","generally | mostly | gist | being moderate","1413230"),
    ("滅多に","めったに","adv","hiếm khi | ít khi","rarely | seldom","1612000"),
    ("存じる","ぞんじる","v1|vt","biết | hay biết | nghĩ | cho là (khiêm nhường)","to know | to think | to consider","1406140"),
    ("弁える","わきまえる","v1|vt","phân biệt (phải trái) | hiểu lẽ | biết điều | biết phận","to discern | to know (one's place) | to understand","1512720"),
    ("申し付ける","もうしつける","v1|vt","ra lệnh | dặn bảo | sai khiến | yêu cầu làm","to instruct | to order | to tell to do","1363020"),
    ("仰る","おっしゃる","v5aru|vt","nói | bảo (kính ngữ) | có tên là","to say | to speak | to tell | to be called","1238840"),
    ("召し上がる","めしあがる","v5r|vt","dùng (bữa) | xơi | dùng (kính ngữ của ăn/uống)","to eat | to drink (honorific)","1346370"),
    ("伺う","うかがう","v5u|vt|vi","đến thăm | hầu | hỏi | nghe (khiêm nhường)","to call on | to ask | to inquire | to hear (humble)","1305700"),
    ("拝見","はいけん","n|vs|vt","xem | được xem (khiêm nhường)","seeing | looking at (humble)","1472270"),
    ("拝借","はいしゃく","n|vs|vt","mượn (khiêm nhường)","borrowing (humble)","1472280"),
    ("頂戴","ちょうだい","n|vs|vt|exp","nhận (khiêm nhường) | xin cho | làm ơn cho","receiving | accepting | please (give me)","1430230"),
    ("承知","しょうち","n|vs|vt","biết rõ | đồng ý | chấp thuận | hiểu | bỏ qua","knowledge | consent | acceptance | acknowledgment","1349480"),
    ("快諾","かいだく","n|vs|vt","vui vẻ nhận lời | sẵn lòng đồng ý","ready consent","1200100"),
    ("応諾","おうだく","n|vs|vt|vi","chấp thuận | đáp ứng | nhận lời","consent | compliance","1179990"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
