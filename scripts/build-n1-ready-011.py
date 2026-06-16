# -*- coding: utf-8 -*-
"""Build N1 ready wave 011 — literature/art/religion terms (set 11)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-011.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("韻律","いんりつ","n","vần luật | nhịp điệu | âm luật (thơ)","metre (of a poem) | rhythm | prosody","1170990"),
    ("韻文","いんぶん","n|adj-no","văn vần | thơ | thi ca","verse | poetry","1170980"),
    ("詩歌","しいか","n","thi ca | thơ (Nhật và Trung) | thơ ca","poetry | poems","1579540"),
    ("逸話","いつわ","n","giai thoại | mẩu chuyện | điển tích","anecdote | story | episode","1167810"),
    ("説話","せつわ","n|vs","truyện kể | thuyết thoại | tích truyện","tale | narrative","1386490"),
    ("叙情詩","じょじょうし","n","thơ trữ tình | thi ca trữ tình","lyric poem | lyric poetry","1344890"),
    ("擬人法","ぎしんほう","n","phép nhân hóa | nhân cách hóa","personification","1759870"),
    ("隠喩","いんゆ","n","ẩn dụ | phép ẩn dụ","metaphor","1170920"),
    ("直喩","ちょくゆ","n","tỉ dụ | so sánh trực tiếp | phép trực dụ","simile","1431630"),
    ("暗喩","あんゆ","n","ẩn dụ | phép ám dụ","metaphor","1154750"),
    ("含意","がんい","n|vs|vt|vi","hàm ý | ngụ ý | hàm nghĩa","implication | connotation","1216900"),
    ("語感","ごかん","n","cảm thức ngôn ngữ | sắc thái từ ngữ | ấn tượng của từ","sense of language | nuance of a word","1271030"),
    ("筆致","ひっち","n","nét bút | bút pháp | phong cách hành văn","stroke of the brush | touch | literary style","1656530"),
    ("名文","めいぶん","n","áng văn hay | danh văn | bài viết nổi tiếng","famous literary composition","1531820"),
    ("美文","びぶん","n","mỹ văn | văn hoa mỹ | lời văn bóng bẩy","flowery prose","1724820"),
    ("悪文","あくぶん","n","văn dở | hành văn kém | câu cú lủng củng","bad style | poor writing","1152460"),
    ("校訂","こうてい","n|vs|vt","hiệu đính | đính chính văn bản | san định","revision of a text | emendation","1593010"),
    ("潤色","じゅんしょく","n|vs|vt","tô điểm văn chương | thêm thắt | gọt giũa lời văn","rhetorical flourishes | embellishment","1595410"),
    ("活写","かっしゃ","n|vs|vt","miêu tả sống động | khắc họa sinh động","vivid description | painting a lively picture","1617720"),
    ("彫琢","ちょうたく","n|vs|vt","chạm khắc và mài giũa | gọt giũa | trau chuốt","carving and polishing","1428100"),
    ("伏線","ふくせん","n","tình tiết gài sẵn | ẩn ý báo trước | sự chuẩn bị ngầm","foreshadowing | preparation","1500290"),
    ("画題","がだい","n","đề tài tranh | chủ đề | tên bức tranh","subject of a painting | motif | title","1197420"),
    ("意匠","いしょう","n","thiết kế | kiểu dáng | ý tưởng | bố cục","design | idea | conception | plan","1156680"),
    ("真髄","しんずい","n","tinh túy | cốt lõi | tinh hoa | linh hồn","essence | quintessence | spirit | pith","1364710"),
    ("極意","ごくい","n","bí quyết thâm sâu | tinh túy (võ/nghệ) | yếu lĩnh","innermost secrets (of an art) | essence","1240220"),
    ("奥義","おうぎ","n","áo nghĩa | bí kíp tuyệt học | tinh hoa cốt tủy","secret techniques | inner mysteries | quintessence","1179430"),
    ("秘伝","ひでん","n|adj-no","bí truyền | bí quyết gia truyền | công thức bí mật","secret (recipe) | mysteries (of an art)","1484100"),
    ("免許皆伝","めんきょかいでん","n","truyền thụ toàn bộ tuyệt học | đắc đạo tinh thông | thành thạo viên mãn","full mastery of an art | initiation into the secrets","1533140"),
    ("師事","しじ","n|vs|vi","theo học | bái sư | thụ giáo | tôn làm thầy","studying under | apprenticing oneself to","1308880"),
    ("師範","しはん","n","sư phụ | bậc thầy | huấn luyện viên (võ/cổ truyền) | sư phạm","master (of an art) | instructor | exemplar","1308990"),
    ("門弟","もんてい","n","môn đệ | đệ tử | học trò","disciple | pupil | follower","1536230"),
    ("門下","もんか","n","môn hạ | học trò | môn sinh | đệ tử","one's pupil | one's follower","1724650"),
    ("高弟","こうてい","n","cao đồ | đệ tử giỏi nhất | học trò xuất sắc","best pupil | leading disciple","1808880"),
    ("家元","いえもと","n","tông chủ (trường phái nghệ thuật) | dòng họ chính thống","head of a school (art) | head family","1191940"),
    ("宗派","しゅうは","n","tông phái | giáo phái | trường phái","sect | denomination | school","1331490"),
    ("戒律","かいりつ","n","giới luật | giáo luật | giới răn","(religious) precept | discipline | commandment","1200700"),
    ("伝道","でんどう","n|vs|vt|vi","truyền đạo | truyền giáo | rao giảng | giảng đạo","missionary work | preaching | evangelism","1442320"),
    ("殉教","じゅんきょう","n|vs|vi","tử vì đạo | tuẫn giáo","martyrdom","1635820"),
    ("信徒","しんと","n","tín đồ | con chiên | người theo đạo","layman | believer | adherent","1359470"),
    ("教徒","きょうと","n","tín đồ | người theo đạo | giáo đồ","believer | adherent","1237290"),
    ("尼僧","にそう","n","ni cô | nữ tu | sư cô","Buddhist nun | Catholic nun","1463410"),
    ("修道","しゅうどう","n|vs|vi","tu đạo | tu hành | tu luyện | học đạo","learning | studying (the way)","1332230"),
    ("涅槃","ねはん","n","niết bàn | giác ngộ tối thượng | viên tịch","nirvana | supreme enlightenment | death of Buddha","1568720"),
    ("極楽","ごくらく","n","cực lạc | thiên đường | cõi Tịnh độ | chốn bồng lai","paradise | Pure Land | heaven on earth","1240250"),
    ("浄土","じょうど","n","Tịnh độ | cõi Tây Phương Cực Lạc | miền tịnh thổ","Pure Land | (Buddhist) paradise","1356670"),
    ("来世","らいせ","n","kiếp sau | thế giới bên kia | hậu thế","afterlife | the next world","1548070"),
    ("前世","ぜんせ","n","kiếp trước | tiền kiếp | tiền thế","one's previous life | previous existence","1393430"),
    ("現世","げんせ","n","kiếp này | đời này | hiện thế | thế gian này","this world | this life","1263790"),
    ("業","ごう","n","nghiệp | nghiệp báo | số phận | tính khí khó kiềm","karma | fate | destiny | uncontrollable temper","1239320"),
    ("読経","どきょう","n|vs|vi","tụng kinh | đọc kinh | niệm kinh","sutra chanting","1456390"),
    ("参詣","さんけい","n|vs|vi","đi lễ chùa/đền | hành hương | viếng đền","visit to a temple or shrine | pilgrimage","1302260"),
    ("祭祀","さいし","n|vs|vt","tế tự | nghi lễ cúng tế | thờ cúng","ritual | religious service","1295330"),
    ("神官","しんかん","n","thần quan | thầy tế (Thần đạo) | tư tế","(Shinto) priest","1364490"),
    ("祝詞","のりと","n","lời cầu khấn (Thần đạo) | văn tế | lời chúc tụng","ritual prayer | invocation of the gods","1337450"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
