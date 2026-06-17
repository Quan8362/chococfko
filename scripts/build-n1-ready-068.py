# -*- coding: utf-8 -*-
"""Build N1 ready wave 068 — abstract compounds (-sei, -ka, -shi, -jutsu, -ryoku, -sha) (set 68)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-068.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("蓋然性","がいぜんせい","n","tính xác suất | khả năng xảy ra | tính khả dĩ","probability | likelihood","1204560"),
    ("偶然性","ぐうぜんせい","n","tính ngẫu nhiên | sự tình cờ | tính bất định | yếu tố may rủi","contingency | randomness | unpredictability","2849513"),
    ("特殊性","とくしゅせい","n","tính đặc thù | nét riêng biệt | tính đặc biệt | đặc trưng riêng","peculiarity | distinctiveness","1455010"),
    ("真実性","しんじつせい","n","tính chân thực | độ xác thực | tính đáng tin | sự thật","authenticity | truth | credibility","1363800"),
    ("合理性","ごうりせい","n","tính hợp lý | tính duy lý | sự logic | tính chính đáng","rationality | reasonableness","1285370"),
    ("非合理","ひごうり","adj-na|n","phi lý | bất hợp lý | thiếu logic | vô lý","illogicality | irrationality","1688630"),
    ("画一化","かくいつか","n|vs","đồng nhất hóa | tiêu chuẩn hóa | rập khuôn | đồng loạt hóa","standardization | uniformity","1197080"),
    ("形骸化","けいがいか","n|vs|vt|vi","hình thức hóa | trở thành vỏ rỗng | hữu danh vô thực | mất thực chất","becoming a mere formality | losing substance","1821010"),
    ("空洞化","くうどうか","n|vs","rỗng hóa | làm rỗng ruột | mất thực chất | sự dịch chuyển công nghiệp ra ngoài","making hollow | deindustrialization","1245940"),
    ("形式化","けいしきか","n|vs|vt|vi","hình thức hóa | quy về hình thức | công thức hóa","formalization","2855873"),
    ("表面化","ひょうめんか","n|vs|vi","lộ ra bề mặt | bùng phát | nổi cộm lên | trở thành vấn đề công khai","coming to the surface | becoming an issue","1489890"),
    ("顕在化","けんざいか","n|vs|vi","hiện rõ | bộc lộ ra | hiển hiện | trở nên rõ ràng | lộ diện","becoming apparent | surfacing | manifesting","1617900"),
    ("硬化","こうか","n|vs|vi","cứng lại | xơ cứng | cứng rắn (thái độ) | tăng giá (thị trường)","hardening | sclerosis | stiffening (of attitude)","1280520"),
    ("軟化","なんか","n|vs|vi","mềm đi | dịu đi (thái độ) | suy yếu (thị trường) | nhượng bộ","softening (of attitude) | weakening","1460740"),
    ("陳腐化","ちんぷか","n|vs","lỗi thời hóa | trở nên lạc hậu | cũ kỹ | lỗi mốt | mất giá trị","obsolescence | becoming obsolete","2815230"),
    ("詐欺師","さぎし","n","kẻ lừa đảo | tay bịp bợm | kẻ lừa gạt | con buôn gian trá","a swindler | a con man | a fraudster","1291700"),
    ("策士","さくし","n","nhà mưu lược | kẻ giỏi bày mưu | tay mưu sĩ | người túc trí đa mưu","a tactician | a schemer","1298270"),
    ("弁士","べんし","n","diễn giả | nhà hùng biện | người thuyết minh phim câm | người dẫn chuyện","a lecturer | an orator | a silent-film narrator","1512960"),
    ("雄弁術","ゆうべんじゅつ","n","thuật hùng biện | nghệ thuật diễn thuyết | tài ăn nói trước công chúng","oratory | the art of public speaking","2858287"),
    ("護身術","ごしんじゅつ","n","thuật tự vệ | võ tự vệ | kỹ năng phòng thân","the art of self-defense","1829530"),
    ("読心術","どくしんじゅつ","n","thuật đọc tâm | khả năng đọc suy nghĩ | tài đoán ý người","mind reading","1456440"),
    ("鑑識眼","かんしきがん","n","con mắt thẩm định | khả năng giám định | con mắt tinh tường | nhãn lực phân biệt","a discerning eye","1815620"),
    ("審美眼","しんびがん","n","con mắt thẩm mỹ | khiếu thẩm mỹ | gu nghệ thuật | con mắt nghệ thuật","an aesthetic sense | an eye for beauty","1360440"),
    ("包容力","ほうようりょく","n","sự bao dung | lòng độ lượng | khả năng dung nạp | tấm lòng rộng mở","tolerance | broad-mindedness","1515560"),
    ("求心力","きゅうしんりょく","n","lực hướng tâm | sức quy tụ | sức gắn kết | lực hút trung tâm","centripetal force | a unifying force","1229490"),
    ("遠心力","えんしんりょく","n","lực ly tâm | sức văng ra ngoài","centrifugal force","1178200"),
    ("統率力","とうそつりょく","n","khả năng thống lĩnh | tài lãnh đạo | năng lực chỉ huy | tài cầm quân","leadership","1943990"),
    ("求道者","きゅうどうしゃ","n","người cầu đạo | kẻ tìm chân lý | người mộ đạo | hành giả","a seeker after truth","1229570"),
    ("偽善者","ぎぜんしゃ","n","kẻ đạo đức giả | người giả nhân giả nghĩa | sói đội lốt cừu","a hypocrite | a wolf in sheep's clothing","1224570"),
    ("好事家","こうずか","n","người sành điệu | kẻ chơi ngông | người có thú chơi lạ | tay sưu tầm sành sỏi","a dilettante | a connoisseur","1277640"),
    ("数寄者","すきしゃ","n","người tao nhã | bậc thầy trà đạo | người phong nhã | kẻ háo sắc","a person of refined taste | a tea ceremony master","2591080"),
    ("風来坊","ふうらいぼう","n","kẻ lang thang | người phiêu bạt | tay giang hồ | kẻ thất thường","a wanderer | a vagabond | a capricious person","1624930"),
    ("遊牧民","ゆうぼくみん","n","dân du mục | người du mục | bộ tộc du cư","a nomad","1826740"),
    ("亡命者","ぼうめいしゃ","n","người tị nạn | kẻ lưu vong | người ly khai chính trị","a refugee | an exile","1518740"),
    ("殉教者","じゅんきょうしゃ","n","người tử vì đạo | kẻ tuẫn giáo | người hy sinh vì tín ngưỡng","a martyr","1341440"),
    ("聖職者","せいしょくしゃ","n","giáo sĩ | tu sĩ | người phụng sự tôn giáo | linh mục","a clergyman | clergy","1940460"),
    ("為政者","いせいしゃ","n","nhà cầm quyền | người trị nước | nhà chính trị | người hoạch định chính sách","a statesman | a policymaker","1157300"),
    ("権力者","けんりょくしゃ","n","kẻ quyền thế | người nắm quyền lực | bậc quyền cao | kẻ có thế lực","a powerful, influential person","1782400"),
    ("実力者","じつりょくしゃ","n","người có thực quyền | nhân vật có ảnh hưởng | tay có máu mặt | kẻ giật dây","an influential person | a power behind the throne","1321550"),
    ("功労者","こうろうしゃ","n","người có công | bậc công thần | người cống hiến lớn | người lập công","a person of distinguished service","1675040"),
    ("立役者","たてやくしゃ","n","nhân vật chủ chốt | người đóng vai chính | nhân vật trung tâm | linh hồn (sự kiện)","a leading figure | a key figure","1837920"),
    ("代弁者","だいべんしゃ","n","người phát ngôn | người nói thay | tiếng nói đại diện | người biện hộ","a spokesperson | a mouthpiece","1412310"),
    ("扇動者","せんどうしゃ","n","kẻ kích động | người xúi giục | kẻ gây rối | tay mị dân","an agitator","1802320"),
    ("首謀者","しゅぼうしゃ","n","kẻ chủ mưu | người cầm đầu | kẻ đầu sỏ | thủ lĩnh (âm mưu)","a ringleader | a mastermind","1329430"),
    ("共謀者","きょうぼうしゃ","n","kẻ đồng mưu | tòng phạm | kẻ a tòng | đồng bọn","a conspirator | an accomplice","1235180"),
    ("無頼漢","ぶらいかん","n","kẻ côn đồ | tên vô lại | quân du đãng | kẻ lưu manh","a ruffian | a scoundrel","1622230"),
    ("天邪鬼","あまのじゃく","n|adj-na|adj-no","kẻ ngang bướng | người hay trái khoáy | kẻ chống đối | quỷ dưới chân tượng hộ pháp","a contrarian | a perverse person","1438260"),
    ("唐変木","とうへんぼく","n","kẻ đần độn | đồ ngốc nghếch | người vô tâm | kẻ chậm hiểu","an oaf | a blockhead | a dunce","1774710"),
    ("往生際","おうじょうぎわ","n","lúc cận kề cái chết | thời điểm phải buông bỏ | sự biết điều chấp nhận (往生際が悪い)","the brink of death | knowing when to give up","1719250"),
    ("修羅場","しゅらば","n","cảnh tượng hỗn loạn | bãi chiến trường đẫm máu | cảnh đánh ghen | lúc nước sôi lửa bỏng","a scene of carnage | a chaotic situation","1332380"),
    ("天王山","てんのうざん","n","điểm mấu chốt | thời khắc quyết định | bước ngoặt sống còn | trận then chốt","a crucial turning point | a watershed","1438440"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
