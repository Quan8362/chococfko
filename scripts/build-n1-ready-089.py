# -*- coding: utf-8 -*-
"""Build N1 ready wave 089 — rare literary 漢語 (set 89)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-089.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("轟然","ごうぜん","adj-t|adv-to","ầm ầm | gầm vang | rền vang | inh tai | dữ dội","roaring | thundering | deafening","1285720"),
    ("劫掠","きょうりゃく","n|vs","cướp bóc | cướp phá | hôi của | plunder","pillage | plunder","1578920"),
    ("傲慢無礼","ごうまんぶれい","n","kiêu ngạo vô lễ | ngạo mạn hỗn xược | xấc xược ngông cuồng","arrogance and insolence","1742090"),
    ("克己心","こっきしん","n","tinh thần khắc kỷ | ý chí tự chủ | sự tự kiềm chế","spirit of self-denial","1285770"),
    ("胡乱","うろん","adj-na|n","khả nghi | mờ ám | đáng ngờ | không rõ ràng","suspicious-looking | fishy","1267590"),
    ("酷烈","こくれつ","adj-na|n","khắc nghiệt | gay gắt | dữ dội | tàn khốc","severity","1287400"),
    ("誤謬推理","ごびゅうすいり","n","suy luận sai lầm | ngụy biện | lập luận lệch lạc","fallacy | paralogism","2442110"),
    ("懇到","こんとう","adj-na|n","ân cần | chu đáo | tử tế tận tình | lịch sự niềm nở","polite | considerate | attentive","2733520"),
    ("昏冥","こんめい","n","tăm tối | u ám | mờ mịt | mịt mù","darkness | gloom","2183380"),
    ("嵯峨","さが","adj-t|adv-to","cheo leo | hiểm trở | dốc đứng | gồ ghề","precipitous","2647550"),
    ("索然","さくぜん","adj-t|adv-to","tẻ nhạt | nhàm chán | khô khan | vô vị","boring | dull | dry","1298360"),
    ("雌雄","しゆう","n","trống mái | đực cái | hơn thua | cao thấp | thắng bại (雌雄を決する)","male and female | victory and defeat","1312940"),
    ("紫紺","しこん","n","tím sẫm | tím than | màu tím biếc","dark purple | bluish purple","1311690"),
    ("獅子吼","ししく","n|vs|vt|vi","sư tử rống | bài diễn thuyết hùng hồn | lời hô hào mạnh mẽ","a lion's roar | a harangue","1845980"),
    ("思惟","しい","n|vs|vt|vi","tư duy | sự suy ngẫm | sự chiêm nghiệm | sự tư lự sâu xa","thought | contemplation | deep deliberation","1309520"),
    ("慈雨","じう","n","mưa lành | mưa rào cứu hạn | cơn mưa quý giá sau hạn (干天の慈雨)","welcome rain after a drought","1315300"),
    ("桎梏","しっこく","n","gông cùm | xiềng xích | sự trói buộc | sự kìm hãm","bonds | fetters","1568050"),
    ("篠突く","しのつく","v5k|vi","mưa như trút | mưa xối xả | mưa nặng hạt (篠突く雨)","to pour down (of rain)","2570030"),
    ("渋面","じゅうめん","n|adj-no","vẻ mặt nhăn nhó | bộ mặt cau có | mặt khó đăm đăm | nhăn mặt","a grimace | a sullen face","1579910"),
    ("昭然","しょうぜん","adj-t|adv-to","rõ ràng | hiển nhiên | rành rành | minh bạch","manifest | clear | evident","1882760"),
    ("書痴","しょち","n","mọt sách | người cuồng sách | kẻ mê sách đến ngớ ngẩn","a book nut | a bibliomaniac","2178450"),
    ("庶幾","しょき","n|vs|vt","mong mỏi | ước ao | khát khao | hy vọng","desire | hope","1619150"),
    ("処世訓","しょせいくん","n","phương châm sống | bài học xử thế | lời răn ở đời | châm ngôn sống","precepts for living | maxims for life","1718690"),
    ("心悸","しんき","n","tim đập | sự hồi hộp | nhịp tim dồn dập | tim đập nhanh (心悸亢進)","heart palpitation | pounding","2848908"),
    ("辰砂","しんしゃ","n","chu sa | thần sa | son chu sa | sơn mài đỏ","cinnabar","2170190"),
    ("浸潤","しんじゅん","n|vs|vi","thấm sâu | thẩm thấu | sự lan thấm | sự xâm nhiễm (tư tưởng)","infiltration | permeation | spread","1362600"),
    ("神韻","しんいん","n","thần vận | vẻ đẹp siêu phàm | nghệ thuật phi thường | thần khí (神韻縹渺)","exceptional artistry","1765560"),
    ("浸礼","しんれい","n","lễ rửa tội bằng dìm nước | phép thanh tẩy ngâm mình","baptism by immersion","1792770"),
    ("尽瘁","じんすい","n|vs|vi","dốc hết sức | tận tụy cống hiến | xả thân vì việc | hết lòng phục vụ","giving one's all to","1721130"),
    ("垂涎三尺","すいぜんさんじゃく","n","thèm rỏ dãi | thèm muốn tột độ | thèm chảy nước miếng | khao khát cháy bỏng","drooling with avid desire","2047770"),
    ("推輓","すいばん","n|vs|vt","sự tiến cử | sự đề bạt | sự giới thiệu (người vào vị trí)","recommendation | nomination","2858283"),
    ("枢機卿","すうききょう","n","hồng y | hồng y giáo chủ (Công giáo)","a cardinal (Catholic Church)","1373350"),
    ("菅笠","すげがさ","n","nón lá cói | nón đan bằng cỏ năn | mũ tre lợp cỏ","a sedge-woven hat","1665880"),
    ("寸毫","すんごう","n","mảy may | chút xíu | một ly | tơ hào (寸毫も〜ない)","not the slightest bit | not at all","2612760"),
    ("寸借","すんしゃく","n|vs|vt","vay món nhỏ | mượn tạm chút ít | vay tạm","a small loan","1700330"),
    ("青嵐","あおあらし","n","gió mát qua cây xanh | làn gió đầu hạ | khí núi xanh tươi","wind through fresh verdure | mountain air","1381790"),
    ("晴朗","せいろう","adj-na|n","quang đãng | trong trẻo | trời tạnh ráo | thanh quang","clear | fair | serene","1376580"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
