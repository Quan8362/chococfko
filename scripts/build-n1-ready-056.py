# -*- coding: utf-8 -*-
"""Build N1 ready wave 056 — literary 漢語 (set 56)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-056.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("先帝","せんてい","n","tiên đế | vua đời trước | hoàng đế quá cố","the late emperor | the preceding emperor","1388160"),
    ("全土","ぜんど","n","toàn quốc | cả nước | khắp đất nước | toàn lãnh thổ","the whole country | the whole land","1395850"),
    ("洗練","せんれん","n|vs|vt","tinh tế | trau chuốt | tao nhã | sành điệu | mài giũa","refinement | polish | sophistication","1391090"),
    ("創痍","そうい","n","vết thương | thương tích | tổn thương (満身創痍: đầy mình thương tích)","a wound | an injury","1398660"),
    ("糟糠","そうこう","n","tấm cám | thức ăn đạm bạc | thuở hàn vi (糟糠の妻)","chaff and bran | plain food | hard times","1818240"),
    ("即妙","そくみょう","adj-na|n","ứng đối nhanh trí | nhanh nhạy ứng khẩu | tài ứng biến tức thời (当意即妙)","ready wit","1826090"),
    ("俗念","ぞくねん","n","tạp niệm trần tục | ham muốn phàm tục | dục vọng đời thường","worldly desires | worldly ambition","1405580"),
    ("俗世間","ぞくせけん","n","cõi trần tục | thế giới phàm trần | xã hội đời thường | nhân gian","this earthly world | secular society","1405500"),
    ("俗説","ぞくせつ","n","lời đồn dân gian | truyền thuyết phổ thông | quan niệm dân gian | dị bản truyền miệng","a common saying | popular folklore","1405520"),
    ("俗物根性","ぞくぶつこんじょう","n|adj-no","tính phàm tục | đầu óc thực dụng tầm thường | thói trưởng giả | tính phô trương","snobbery | philistinism","2049370"),
    ("其処此処","そこここ","n","đây đó | chỗ này chỗ kia | khắp nơi | rải rác đó đây","here and there | in places","2010140"),
    ("素行","そこう","n","hạnh kiểm | tư cách | hành vi thường ngày | nết na (素行が悪い)","behaviour | conduct","1397210"),
    ("措辞","そじ","n","cách dùng từ | lối hành văn | cách diễn đạt | bút pháp","wording | phraseology | diction","1396520"),
    ("損料","そんりょう","n","tiền thuê | phí thuê mướn | tiền cho thuê đồ","a rental fee","1700790"),
    ("退嬰","たいえい","n","bảo thủ | thụt lùi | rụt rè không tiến thủ | trì trệ thoái lui (退嬰的)","conservatism | regression | unadventurousness","2843381"),
    ("大悟徹底","たいごてってい","n|vs|vi","đại ngộ triệt để | giác ngộ hoàn toàn | thấu suốt chân lý tuyệt đối","attaining complete enlightenment","2049630"),
    ("大慈大悲","だいじだいひ","n","đại từ đại bi | lòng từ bi vô hạn | bao dung thương xót lớn lao","great compassion and mercy","1786860"),
    ("大葬","たいそう","n","đại tang | tang lễ hoàng gia | quốc tang của hoàng đế","an imperial funeral","1786710"),
    ("高枕","たかまくら","n","gối cao | ngủ yên không lo lắng | kê cao gối ngủ (高枕で寝る: yên tâm)","a high pillow | sleeping soundly without worry","1808970"),
    ("逞しい","たくましい","adj-i","cường tráng | vạm vỡ | kiên cường | mạnh mẽ | dồi dào (sức sống)","burly | sturdy | indomitable | robust","1573650"),
    ("玉響","たまゆら","n|adv|adj-no","thoáng chốc | khoảnh khắc ngắn ngủi | trong tích tắc | phút giây thoáng qua","a fleeting moment | a short while","2564590"),
    ("誰彼","だれかれ","pn","người này người nọ | ai đó | bất kỳ ai | nhiều người (誰彼構わず)","this or that person | anybody","1891970"),
    ("端倪","たんげい","n|vs|vt","phỏng đoán | suy đoán | lường trước | dự liệu (端倪すべからず: khó lường)","conjecture | surmise","1704790"),
    ("痴愚","ちぐ","n","ngu si | đần độn | dốt nát ngớ ngẩn | ngu ngốc","imbecility | idiocy","1770410"),
    ("蓄財","ちくざい","n|vs|vt|vi","tích lũy của cải | gom góp tài sản | tích trữ tiền bạc | làm giàu","amassing wealth","1422430"),
    ("知行","ちこう","n","tri và hành | hiểu biết và hành động | cai quản lãnh địa (知行合一)","knowledge and action | ruling a fief","2829365"),
    ("雉","キジ","n","chim trĩ | gà lôi xanh Nhật Bản (雉も鳴かずば撃たれまい)","a green pheasant","1591200"),
    ("茶番","ちゃばん","n|adj-no","trò hề | màn kịch lố bịch | tấn tuồng | tiểu phẩm khôi hài | người pha trà","a farce | a charade","1422830"),
    ("嫡流","ちゃくりゅう","n","dòng đích | dòng chính thống | dòng trưởng | huyết thống chính tông","a direct line of descent | the main family line","1422960"),
    ("忠勤","ちゅうきん","n","tận trung phục vụ | trung thành mẫn cán | hết lòng phụng sự (忠勤を励む)","loyal and faithful service","1623300"),
    ("中興","ちゅうこう","n|vs|vt","trung hưng | phục hưng | chấn hưng | khôi phục thịnh vượng","restoration | revival | resurgence","1423940"),
    ("忠勇","ちゅうゆう","adj-na|n","trung dũng | trung thành và dũng cảm | tận trung quả cảm","loyalty and bravery","1717470"),
    ("朝野","ちょうや","n","triều đình và dân chúng | trong và ngoài chính quyền | cả nước (朝野を挙げて)","government and people | the entire nation","1653300"),
    ("朝貢","ちょうこう","n|vs|vi","triều cống | cống nạp | dâng cống phẩm | thần phục cống nộp","bringing tribute","1616620"),
    ("弔慰","ちょうい","n|vs|vt","phúng viếng | chia buồn | an ủi tang quyến | điếu úy (弔慰金)","condolence | sympathy","2857603"),
    ("跳梁","ちょうりょう","n|vs|vi","hoành hành | lộng hành | nhảy nhót tác oai | ngang ngược tung hoành (跳梁跋扈)","rampancy | running rampant","1623150"),
    ("帳消し","ちょうけし","n","xóa nợ | hủy bỏ | bù trừ | cân bằng sổ sách | xí xóa (帳消しにする)","writing off (a debt) | cancellation | offsetting","1427530"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
