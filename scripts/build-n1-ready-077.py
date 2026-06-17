# -*- coding: utf-8 -*-
"""Build N1 ready wave 077 — emotion/intention nouns (-nen, -i, -gan) (set 77)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-077.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("惻隠の情","そくいんのじょう","n","lòng trắc ẩn | lòng thương xót | lòng từ bi | sự thương cảm","compassion | pity","1889810"),
    ("望郷の念","ぼうきょうのねん","n","nỗi nhớ quê | tình hoài hương | nỗi nhớ cố hương","a sense of nostalgia for home","1519670"),
    ("自責の念","じせきのねん","exp","sự dằn vặt lương tâm | nỗi ăn năn | cảm giác tội lỗi | nỗi day dứt","a guilty conscience | feelings of remorse","2522390"),
    ("畏敬の念","いけいのねん","exp|n","lòng kính sợ | sự tôn kính | niềm kính ngưỡng | lòng sùng kính","feelings of awe and reverence","2853137"),
    ("羨望の的","せんぼうのまと","exp|n","đối tượng ghen tị | mục tiêu ngưỡng mộ | điều khiến ai cũng thèm muốn","an object of envy","2830027"),
    ("憧れの的","あこがれのまと","exp|n","thần tượng | đối tượng ngưỡng mộ | hình mẫu khao khát | mục tiêu mơ ước","an object of adoration | an idol","2228920"),
    ("注目の的","ちゅうもくのまと","exp|n","tâm điểm chú ý | trung tâm của sự quan tâm | đối tượng được để mắt","the center of attention","2726170"),
    ("嫉妬の炎","しっとのほのお","exp|n","ngọn lửa ghen tuông | cơn ghen bừng bừng | lửa hờn ghen","the flames of jealousy","1880920"),
    ("殺気立つ","さっきだつ","v5t|vi","đằng đằng sát khí | sôi sục giận dữ | hung hãn | điên cuồng đe dọa","to be seething with anger | to be menacing","1848220"),
    ("心意気","こころいき","n","khí phách | tinh thần quyết tâm | chí khí | nhuệ khí | bản lĩnh","spirit | determination | mettle","1793720"),
    ("心地","ここち","n|n-suf","cảm giác | tâm trạng | cảm nhận | trạng thái lòng (居心地)","a feeling | a sensation | a mood","1360820"),
    ("性根","しょうね","n","bản tính | căn tính | cốt cách | tâm tính cốt lõi (性根を据える)","one's nature | one's character","1375370"),
    ("肝っ玉","きもったま","n","gan dạ | bản lĩnh | lá gan | dũng khí | sự can đảm","guts | pluck | nerve","1757590"),
    ("無慮","むりょ","adv","khoảng chừng | ước chừng | xấp xỉ | đại khái","approximately","1673530"),
    ("浅慮","せんりょ","n","thiển cận | suy nghĩ nông cạn | thiếu cân nhắc | hấp tấp thiếu suy xét","imprudence | thoughtlessness","1646160"),
    ("配意","はいい","n|vs","sự quan tâm | lưu tâm | chu đáo | để ý cân nhắc | thận trọng lo liệu","regard | consideration | thoughtfulness","2017920"),
    ("留意","りゅうい","n|vs|vi","lưu ý | chú ý | để tâm | ghi nhớ | lưu tâm tới","heeding | paying attention | bearing in mind","1552720"),
    ("本意","ほんい","n","ý định thật | tâm ý thực | nguyện vọng ban đầu | mục đích thật sự | bản ý","one's real intention | one's true will","1522180"),
    ("不本意","ふほんい","adj-na|n","trái ý | miễn cưỡng | bất đắc dĩ | không như mong muốn | đáng tiếc","reluctant | unwilling | unintended | disappointing","1494940"),
    ("害意","がいい","n","ác ý | ý đồ hãm hại | ý định gây hại | manh tâm","malice | malicious intent","1757620"),
    ("他意","たい","n","ẩn ý | ý đồ khác | dụng ý xấu | ác ý ngầm | bụng dạ khác (他意はない)","an ulterior motive | ill will","1406940"),
    ("意気","いき","n","khí thế | tinh thần | nhuệ khí | hào khí | tâm khí (意気投合)","spirit | heart | disposition","1156430"),
    ("大望","たいもう","n","hoài bão lớn | tham vọng lớn lao | chí lớn | khát vọng lớn","a great aspiration | a great ambition","1415040"),
    ("宿願","しゅくがん","n","tâm nguyện ấp ủ | nguyện vọng bấy lâu | ước nguyện từ lâu | hoài bão lâu năm","a longstanding desire","1656840"),
    ("悲願","ひがん","n","tâm nguyện thiết tha | nguyện vọng cháy bỏng | đại nguyện cứu độ (Phật) | ước nguyện sâu xa","one's dearest wish | a Buddha's vow","1483260"),
    ("念願","ねんがん","n|vs|vt|adj-no","tâm nguyện | nguyện ước | mong mỏi bấy lâu | điều hằng ao ước","one's heart's desire | one's dearest wish","1469390"),
    ("祈念","きねん","n|vs|vt","cầu nguyện | khấn nguyện | nguyện cầu | cầu khẩn","a prayer","1222800"),
    ("祈願","きがん","n|vs|vt","cầu khẩn | cầu nguyện (điều gì) | khấn vái | thỉnh nguyện","a prayer (for something) | supplication","1222780"),
    ("切願","せつがん","n|vs|vt","khẩn cầu tha thiết | van nài | nài xin | cầu khẩn thiết tha","an earnest entreaty | supplication","1385000"),
    ("哀願","あいがん","n|vs|vt|vi","van xin | khẩn cầu thảm thiết | cầu xin | năn nỉ | kêu gọi lòng thương","supplication | an entreaty | a plea","1150210"),
    ("志願","しがん","n|vs|vt|vi|adj-no","tình nguyện | xung phong | ứng tuyển | khát vọng | nguyện vọng (志願兵)","aspiration | volunteering | application","1309080"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
