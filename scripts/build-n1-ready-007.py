# -*- coding: utf-8 -*-
"""Build N1 ready wave 007 — 四字熟語 idioms + formal nouns (set 7)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-007.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("付和雷同","ふわらいどう","n|vs|vi","a dua | hùa theo mù quáng | gió chiều nào theo chiều ấy","following blindly | following suit without reflection","1496450"),
    ("支離滅裂","しりめつれつ","adj-na|adj-no","rời rạc | lủng củng | thiếu mạch lạc | hỗn loạn vô lý","incoherent | inconsistent | disorderly | nonsensical","1310320"),
    ("針小棒大","しんしょうぼうだい","adj-na|n","bé xé ra to | thổi phồng | chuyện bé xé ra to","exaggeration | making a mountain out of a molehill","1366260"),
    ("臥薪嘗胆","がしんしょうたん","n|vs|vi","nằm gai nếm mật | nếm mật nằm gai (chịu khổ để báo thù)","enduring hardships for the sake of vengeance","1197700"),
    ("快刀乱麻","かいとうらんま","n","giải quyết gọn ghẽ | chặt đứt mớ bòng bong | xử lý nhanh khéo","solving a problem swiftly and skillfully","1200150"),
    ("旧態依然","きゅうたいいぜん","adj-na|adj-no|adj-t|adv-to|n","y như cũ | giậm chân tại chỗ | bảo thủ không đổi","remaining unchanged | none the better for the change","1231030"),
    ("興味津々","きょうみしんしん","adj-no|adj-t|adv-to","vô cùng hứng thú | tò mò mãnh liệt | say mê tột độ","very interesting | of absorbing interest | keenly curious","1591690"),
    ("広大無辺","こうだいむへん","adj-na|adj-no|n","bao la vô tận | rộng lớn vô biên | mênh mông vô hạn","boundless | infinite | vast","1615760"),
    ("面目躍如","めんもくやくじょ","adj-t|adv-to","xứng danh | đúng với tiếng tăm | nâng cao thanh thế","living up to one's name | worthy of one's reputation","2032850"),
    ("利害得失","りがいとくしつ","n","lợi hại được mất | thiệt hơn | mặt lợi và mặt hại","advantages and disadvantages | pros and cons","1758360"),
    ("竜頭蛇尾","りゅうとうだび","n","đầu voi đuôi chuột | hùng hổ lúc đầu yếu ớt về sau","strong beginning and weak ending | anticlimax","1553040"),
    ("和洋折衷","わようせっちゅう","n|adj-no","kết hợp Nhật-Tây | pha trộn phong cách Nhật và phương Tây","blending of Japanese and Western styles","1562290"),
    ("熟慮断行","じゅくりょだんこう","n|vs","thận trọng cân nhắc rồi dứt khoát hành động","being deliberate in council and decisive in action","1337920"),
    ("単刀直入","たんとうちょくにゅう","adj-na|adj-no|n","đi thẳng vào vấn đề | nói thẳng | bộc trực","straight to the point | point-blank | frank","1417770"),
    ("徹頭徹尾","てっとうてつび","adv","triệt để | từ đầu chí cuối | hoàn toàn | nhất quán","thoroughly | through and through | from start to finish","1437690"),
    ("天変地異","てんぺんちい","n","thiên tai địa chấn | tai biến thiên nhiên | đại họa","natural disaster | cataclysm","1440330"),
    ("日常茶飯事","にちじょうさはんじ","n","chuyện thường ngày | cơm bữa | việc thường tình","everyday occurrence","1730400"),
    ("博学多才","はくがくたさい","n","học rộng tài cao | uyên bác đa tài","wide knowledge and versatile talents","1474600"),
    ("不老不死","ふろうふし","n|adj-no","trường sinh bất tử | trẻ mãi không già","perpetual youth and longevity | immortality","1495450"),
    ("平身低頭","へいしんていとう","n|vs|vi","cúi rạp mình | khúm núm | dập đầu tạ lỗi","prostrating oneself | kowtowing","1507460"),
    ("無病息災","むびょうそくさい","n","khỏe mạnh không bệnh tật | bình an vô sự","sound health","2032740"),
    ("門外不出","もんがいふしゅつ","n|adj-no","bảo vật gia truyền (không cho ra ngoài) | giữ kín không cho mượn","never taking (a treasure) off the premises","1536160"),
    ("唯一無二","ゆいいつむに","adj-no|adj-na|n","duy nhất | có một không hai | độc nhất vô nhị","one and only | unique","1538930"),
    ("用意周到","よういしゅうとう","adj-na|n","chuẩn bị chu đáo | cẩn thận kỹ lưỡng | tính toán toàn diện","very careful | thoroughly prepared","1546230"),
    ("有名無実","ゆうめいむじつ","adj-na|adj-no|n","hữu danh vô thực | có tiếng không có miếng","in name but not in reality","1541640"),
    ("冥利","みょうり","n","phúc phận | may mắn trời ban | ân huệ | cái lợi","providence | luck | favour | advantage","1531320"),
    ("目論見","もくろみ","n","kế hoạch | mưu tính | ý đồ | toan tính | dự định","plan | scheme | design | intention | aim","1535730"),
    ("猛省","もうせい","n|vs|vt|vi","tự kiểm điểm sâu sắc | suy xét nghiêm túc | ăn năn","serious reflection | soul-searching | penitence","1674740"),
    ("猛者","もさ","n","tay cứng cựa | kẻ gan dạ | chiến binh dũng mãnh","tough guy | fearless fighter","1534030"),
    ("悶着","もんちゃく","n|vs|vi","xích mích | tranh cãi | rắc rối | lục đục","trouble | quarrel | dispute","1536100"),
    ("躍動","やくどう","n|vs|vi","chuyển động sống động | rộn ràng | nhịp đập sôi nổi","lively motion | throb","1538470"),
    ("和睦","わぼく","n|vs|vi","hòa giải | giảng hòa | làm lành | hòa hảo","reconciliation | peace | rapprochement","1562250"),
    ("湾曲","わんきょく","n|vs|vi","cong | uốn cong | gập | vẹo","curve | bend | crook","1562820"),
    ("凡庸","ぼんよう","adj-na|adj-no|n","tầm thường | bình thường | xoàng xĩnh | nhạt nhẽo","mediocre | ordinary | commonplace | banal","1523660"),
    ("反芻","はんすう","n|vs|vt","nhai lại | ngẫm nghĩ | suy đi nghĩ lại","rumination | chewing the cud | turning over in one's mind","1481160"),
    ("顰蹙","ひんしゅく","n|vs|vi","cau mày | nhăn mặt khó chịu | tỏ ý chê trách","frowning on | showing disapproval","1574360"),
    ("漂泊","ひょうはく","n|vs|vi","phiêu bạt | lang bạt | trôi dạt | lênh đênh","roaming | drifting about | wandering","1617220"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
