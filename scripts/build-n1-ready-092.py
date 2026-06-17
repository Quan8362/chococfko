# -*- coding: utf-8 -*-
"""Build N1 ready wave 092 — rare literary 漢語 (set 92)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-092.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("擾乱","じょうらん","n|vs|vt|vi","sự náo loạn | sự rối ren | sự gây rối | bạo loạn","disturbance | disorder","1827530"),
    ("冗語","じょうご","n","lời thừa | nói rườm rà | lời lảm nhảm | chuyện vô ích","verbiage | wordiness | unnecessary talk","1595440"),
    ("猖獗","しょうけつ","n|vs|vi","sự hoành hành | sự lan tràn dữ dội | sự bùng phát (dịch bệnh)","running rampant | spreading","2824880"),
    ("逍遥学派","しょうようがくは","n","phái Tiêu Dao | trường phái Peripatetic (triết học Aristotle)","the Peripatetic school","1883050"),
    ("霄壌","しょうじょう","n","trời và đất | thiên địa | khoảng cách trời vực (霄壌の差)","heaven and earth","1574080"),
    ("従容自若","しょうようじじゃく","adj-t|adv-to","ung dung tự tại | điềm nhiên bình thản | thản nhiên trấn tĩnh","calm and self-possessed | imperturbable","2047120"),
    ("障泥","あおり","n","tấm chắn bùn yên ngựa | miếng da che bùn dưới yên","a saddle flap","2601020"),
    ("頭垢","ふけ","n","gàu | gàu tóc | vảy da đầu","dandruff","1602560"),
    ("桐","きり","n","cây ngô đồng | gỗ đồng | cây paulownia","paulownia | empress tree","1240710"),
    ("塗炭の苦しみ","とたんのくるしみ","exp|n","nỗi khổ lầm than | cảnh cùng khổ | nước sôi lửa bỏng | cực khổ tột cùng","misery | extreme distress","1444310"),
    ("土崩瓦解","どほうがかい","n|vs","sụp đổ tan tành | tan rã hoàn toàn | đổ vỡ không cứu vãn | rã đám","complete collapse | going to pieces","2051240"),
    ("吶喊","とっかん","n|vs|vi","tiếng hô xung trận | hò reo xông lên | tiếng thét tấn công","a battle cry | charging with a shout","2575610"),
    ("頓悟","とんご","n|vs","đốn ngộ | giác ngộ tức thì | bừng tỉnh ngộ đạo","sudden enlightenment","2191870"),
    ("名聞","めいぶん","n","danh tiếng | tiếng tăm | thanh danh | hư danh (名聞利養)","reputation | fame","1650040"),
    ("網羅的","もうらてき","adj-na","toàn diện | bao quát | đầy đủ | thâu tóm hết | tổng thể","comprehensive | exhaustive","2443600"),
    ("孟浪","もうろう","adj-na|n","cẩu thả | qua loa | hồ đồ | lơ đễnh | thiếu mạch lạc","careless | incoherent | sloppy","2840522"),
    ("木鶏","もっけい","n","gà gỗ | bậc cao thủ điềm tĩnh | người bản lĩnh không nao núng (木鶏たれ)","an unflinching, imperturbable master","2868699"),
    ("靖国","やすくに","n","đền Yasukuni | Tĩnh Quốc (đền thờ)","Yasukuni (Shrine)","2098340"),
    ("野禽","やきん","n","chim hoang dã | chim trời | cầm dã","wild birds","1712060"),
    ("有職故実","ゆうそくこじつ","n","điển chương cổ lệ | nghiên cứu nghi thức cung đình và võ gia xưa | cổ học điển lễ","studies of ancient court and samurai customs","1745920"),
    ("夕餉","ゆうげ","n","bữa tối | cơm chiều | bữa cơm tối","an evening meal | supper","1739970"),
    ("邀撃","ようげき","n|vs|vt","đánh chặn | nghênh kích | phản công chặn địch","interception | counter-attack","1573700"),
    ("窈窕","ようちょう","adj-t|adv-to","yểu điệu | thướt tha | mảnh mai duyên dáng | yêu kiều (窈窕淑女)","graceful | slim and beautiful","2826850"),
    ("里程標","りていひょう","n","cột mốc dặm đường | mốc lộ giới | dấu mốc quan trọng","a milepost | a milestone","1644470"),
    ("流暢","りゅうちょう","adj-na|n","lưu loát | trôi chảy | thông thạo | trơn tru (ngôn ngữ)","fluent | flowing","1552430"),
    ("柳暗花明","りゅうあんかめい","n","liễu rủ hoa tươi | cảnh xuân tươi đẹp | phố đèn lồng hoa lệ | xóm ăn chơi","beautiful spring scenery | a red-light district","2054930"),
    ("凌霄花","のうぜんかずら","n","hoa lăng tiêu | hoa đăng tiêu | dây leo kèn Trung Hoa","Chinese trumpet creeper","1643320"),
    ("燎原の火","りょうげんのひ","exp|n","lửa cháy đồng | thế lửa lan không thể ngăn | đám cháy lan tràn dữ dội","a wildfire | an unstoppable spreading force","2836264"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
