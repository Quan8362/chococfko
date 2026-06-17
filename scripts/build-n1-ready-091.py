# -*- coding: utf-8 -*-
"""Build N1 ready wave 091 — rare literary 漢語 (set 91)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-091.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("内発","ないはつ","n|vs|vi","sự bộc phát từ bên trong | động lực nội tại | nội phát","a burst of energy from within","1791920"),
    ("難詰","なんきつ","n|vs|vt","sự khiển trách | sự chất vấn gay gắt | sự trách mắng nặng nề","reprimand | severe questioning","1460920"),
    ("忍苦","にんく","n|vs|vi","sự nhẫn nhịn chịu khổ | sự kiên nhẫn chịu đựng | tinh thần khắc kỷ","endurance | stoicism","1467460"),
    ("佞臣","ねいしん","n","gian thần | nịnh thần | bề tôi xảo trá | kẻ phản bội","a crafty courtier | a traitor","1566010"),
    ("覗き眼鏡","のぞきめがね","n","kính nhòm | hộp ngắm phóng đại | kính soi đáy nước | ống nhòm dưới nước","a peep show device | a water glass","2578200"),
    ("能事","のうじ","n","việc phải làm | bổn phận | công việc của mình (能事足れり: làm tròn phận sự)","one's work | one's duty","1470170"),
    ("拝跪","はいき","n|vs|vi","quỳ lạy | quỳ gối cầu khấn | phủ phục bái lạy","kneeling down to pray","2832617"),
    ("佩刀","はいとう","n|vs|vi","đeo kiếm | thanh kiếm đeo bên hông | sự mang gươm","wearing a sword","1563290"),
    ("跋渉","ばっしょう","n|vs|vi","lặn lội | rong ruổi khắp nơi | đi khắp chốn | ngao du khắp đó đây","wandering | trekking","1680150"),
    ("跋扈跳梁","ばっこちょうりょう","n|vs|vi","tác oai tác quái | hoành hành ngang ngược | kẻ ác lộng hành khắp nơi","evildoers being rampant","2052080"),
    ("非望","ひぼう","n","tham vọng ngông cuồng | mưu đồ quá đáng | dã tâm trái lẽ","inordinate ambition","1688780"),
    ("誹毀","ひき","n|vs","sự phỉ báng | sự bôi nhọ | sự vu khống | lời nói xấu","defamation | libel | slander","2257310"),
    ("微醺","びくん","n","hơi say | ngà ngà say | chếnh choáng | lâng lâng men rượu","slight intoxication | being tipsy","1633910"),
    ("逼塞","ひっそく","n|vs|vi","bế tắc cùng quẫn | sống ẩn dật vì sa cơ | bị dồn vào ngõ cụt","being trapped | withdrawal due to hardship","1772290"),
    ("畢竟するに","ひっきょうするに","exp|adv","suy cho cùng | rốt cuộc | tóm lại | nói cho cùng","after all | in the end","2538300"),
    ("飛沫","ひまつ","n","giọt bắn | bụi nước | tia nước bắn | giọt li ti","a splash | a spray | a droplet","2768740"),
    ("氷釈","ひょうしゃく","n|vs","tan như băng | nghi ngờ tiêu tan | mọi hiềm nghi tan biến","melting like ice | dispelling doubts","1489040"),
    ("豹変","ひょうへん","n|vs|vi","thay đổi đột ngột | trở mặt nhanh chóng | biến chuyển hoàn toàn (君子豹変)","a sudden, complete change","1490100"),
    ("表象","ひょうしょう","n|vs|vt","biểu tượng | hình tượng | biểu trưng | ý niệm hình dung","a symbol | a representation","1489690"),
    ("廟議","びょうぎ","n","triều nghị | cuộc bàn việc nước nơi triều đình | hội nghị cơ mật","a court council","2842266"),
    ("頻数","ひんすう","n","tần số | tần suất | số lần thường xuyên","frequency","1905140"),
    ("扶翼","ふよく","n|vs|vt","sự phò tá | sự giúp đỡ | sự hỗ trợ nâng đỡ | sự phù trợ","help | aid | support","1691010"),
    ("父祖","ふそ","n","tổ tiên | cha ông | ông cha | tiền nhân","ancestors","1690760"),
    ("腐儒","ふじゅ","n","hủ nho | nhà nho cổ hủ | học giả vô dụng | kẻ sĩ hủ lậu","a pedant | a worthless scholar","1656290"),
    ("焚書坑儒","ふんしょこうじゅ","n","đốt sách chôn nho | phần thư khanh nho | sự đàn áp tư tưởng tàn bạo (nhà Tần)","burning books and burying scholars alive","2032480"),
    ("弊衣","へいい","n","áo quần rách rưới | y phục cũ sờn | quần áo lam lũ (弊衣破帽)","worn-out, shabby clothes","1508260"),
    ("劈頭","へきとう","n","ngay từ đầu | mở đầu | khởi đầu | lúc bắt đầu | mào đầu","the beginning | the outset","1564830"),
    ("匍匐","ほふく","n|vs|vi","sự bò trườn | sự bò sát đất | trườn lén | bò lê (匍匐前進)","creeping | crawling","1564940"),
    ("報謝","ほうしゃ","n|vs|vi","sự đền ơn | sự báo đáp ân nghĩa | bố thí (cho sư/người hành hương)","requital of a favor | giving alms","1828040"),
    ("泡沫候補","ほうまつこうほ","n","ứng viên vô danh | ứng cử viên không có cơ hội | ứng viên lót đường","a fringe candidate","1747800"),
    ("発作的","ほっさてき","adj-na","bộc phát | đột phát | thất thường | bất chợt | từng cơn","spasmodic | fitful | sporadic","1679260"),
    ("勃興","ぼっこう","n|vs|vi","sự trỗi dậy mạnh mẽ | sự hưng thịnh đột ngột | sự vươn lên nhanh chóng","a sudden rise to power","1521930"),
    ("仄聞","そくぶん","n|vs|vt","nghe phong thanh | nghe loáng thoáng | nghe đồn | nghe nói","hearing by chance | hearing by hearsay","1596500"),
    ("牡丹","ぼたん","n","hoa mẫu đơn | mẫu đơn | thịt lợn rừng (lóng)","a tree peony | wild boar meat","1182880"),
    ("墨痕","ぼっこん","n","nét mực | dấu mực | nét bút mực tàu | bút tích","ink marks | handwriting","1521550"),
    ("発心","ほっしん","n|vs|vi","phát tâm | giác ngộ | quyết chí tu hành | nảy ra ý nguyện","spiritual awakening | resolution","1679170"),
    ("枉惑","おうわく","n","sự lừa phỉnh | sự mê hoặc | trò gian trá | sự đánh lừa","trickery | deception","2113550"),
    ("鞭撻","べんたつ","n|vs|vt","sự khích lệ | sự đốc thúc | sự rèn giũa nghiêm khắc | sự thúc giục (ご鞭撻)","encouragement | urging | spurring on","1513200"),
    ("微塵子","ミジンコ","n","con bọ nước | rận nước | bọ chét nước","a water flea","1486060"),
    ("明眸皓歯","めいぼうこうし","exp|n","mắt sáng răng trắng | mỹ nhân tuyệt sắc | giai nhân nghiêng nước","starry eyes and white teeth (a beauty)","1911700"),
    ("妄断","もうだん","n|vs","phán đoán hồ đồ | quyết định liều lĩnh | kết luận vội vàng | định đoạt thiếu suy xét","a reckless decision","1671090"),
    ("黙示","もくし","n|vs|vt","sự ngụ ý ngầm | sự ám chỉ | sự mặc thị | sự khải thị (黙示録)","tacit implication | revelation","1534980"),
    ("野趣","やしゅ","n","vẻ đẹp mộc mạc | nét hoang dã | phong vị đồng quê | nét quê kiểng","rustic beauty | rural charm","1537410"),
    ("憂悶","ゆうもん","n|vs|vi","sự ưu phiền | nỗi sầu muộn | sự day dứt khổ tâm | u uất","anguish | mortification","1540900"),
    ("幽邃","ゆうすい","adj-na|n","thanh tịnh tĩnh mịch | u tịch sâu lắng | hẻo lánh yên tĩnh","retired and quiet | secluded","1540660"),
    ("悠揚迫らぬ","ゆうようせまらぬ","exp|adj-f","ung dung điềm tĩnh | thong dong không vội | bình thản khoan thai","calm | composed","2658290"),
    ("夢魔","むま","n","ác mộng | ma đè | quỷ nhập mộng | bóng đè","a nightmare | an incubus","1773660"),
    ("夭逝","ようせい","n|vs|vi","chết yểu | mất sớm | yểu mệnh | đoản mệnh","premature death","1565880"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
