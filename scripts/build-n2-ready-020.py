# -*- coding: utf-8 -*-
"""Build N2 ready wave 020 — cooking, food, sewing/clothing, household, utilities."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-020.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("炊事","すいじ","n|vs|vi","việc bếp núc | nấu nướng","cooking | kitchen work","1372350"),
    ("下ごしらえ","したごしらえ","n|vs|vt","sơ chế | chuẩn bị trước | làm sẵn nguyên liệu","preliminary preparation | pre-cooking","1186630"),
    ("具材","ぐざい","n","nguyên liệu | thành phần (món ăn)","material | ingredient","2415590"),
    ("栄養素","えいようそ","n","chất dinh dưỡng | dưỡng chất","nutrient","1174040"),
    ("炭水化物","たんすいかぶつ","n","carbohydrate | tinh bột đường | chất bột đường","carbohydrate","1418560"),
    ("腹ごしらえ","はらごしらえ","n|vs","ăn lót dạ | ăn trước khi làm việc","having a meal (before doing something)","1748300"),
    ("偏食","へんしょく","n|vs|vi","ăn uống thiên lệch | kén ăn | ăn không cân bằng","unbalanced diet","1510520"),
    ("過食","かしょく","n|vs","ăn quá nhiều | ăn uống vô độ","overeating","1196190"),
    ("小食","しょうしょく","n","ăn ít | ăn uống đạm bạc","light eating | not eating much","1348310"),
    ("試飲","しいん","n|vs|vt","uống thử | nếm thử (đồ uống)","sampling a drink | tasting","1733420"),
    ("晩酌","ばんしゃく","n|vs|vi","uống rượu bữa tối | nhâm nhi bữa tối","drink at home with one's evening meal","1482180"),
    ("酔っ払い","よっぱらい","n","người say rượu | kẻ say | sự say xỉn","drunk person | being drunk","1372660"),
    ("宴会","えんかい","n","tiệc | yến tiệc | tiệc chiêu đãi","party | banquet | feast","1176320"),
    ("出前","でまえ","n|vs|vt","giao đồ ăn tận nơi | đặt món mang đến","home delivery (of food)","1339530"),
    ("冷蔵","れいぞう","n|vs|vt","bảo quản lạnh | trữ lạnh","cold storage | refrigeration","1557100"),
    ("保温","ほおん","n|vs|vi|vt","giữ ấm | giữ nhiệt | cách nhiệt","retaining warmth | heat insulation","1513310"),
    ("煮込み","にこみ","n","món hầm | món ninh nhừ","stew | hodgepodge","1322570"),
    ("蒸し","むし","n|n-suf","hấp | sự hấp","steaming","1911300"),
    ("揚げ","あげ","n","chiên ngập dầu | đồ chiên | đậu phụ chiên","deep-frying | deep-fried food | abura-age","1545490"),
    ("焼き","やき","n|n-pref|n-suf","nướng | quay | tôi (kim loại) | đồ gốm","roasting | grilling | tempering | -ware","2265630"),
    ("炒め","いため","n-suf|n-pref","xào | món xào","stir-fry | stir-frying","2771310"),
    ("熟成","じゅくせい","n|vs|vi","ủ chín | lên men | ủ lâu (rượu, thịt)","maturing | ageing | curing","1337870"),
    ("萎びる","しなびる","v1|vi","héo | quắt lại | nhăn nheo | tóp lại","to shrivel | to wilt | to wither","1158680"),
    ("裁縫","さいほう","n|vs|vi","may vá | khâu vá | nữ công","sewing | needlework","1296200"),
    ("縫製","ほうせい","n|vs|vt","may (bằng máy) | gia công may","sewing (by machine)","1729140"),
    ("仕立て","したて","n","may đo | cắt may | chuẩn bị | rèn dạy","tailoring | sewing | preparation | training","1305550"),
    ("採寸","さいすん","n|vs|vt|vi","đo (số đo cơ thể) | lấy số đo","taking measurements","1294820"),
    ("衣替え","ころもがえ","n|vs|vi","thay đồ theo mùa | đổi diện mạo | làm mới","seasonal change of clothing | facelift","1593470"),
    ("洗剤","せんざい","n","chất tẩy rửa | bột giặt | nước rửa","detergent | cleanser | cleaning agent","1390950"),
    ("柔軟剤","じゅうなんざい","n","nước xả vải | chất làm mềm vải","fabric softener | fabric conditioner","2158020"),
    ("漂白","ひょうはく","n|vs|vt","tẩy trắng","blanching | bleaching","1489280"),
    ("脱水","だっすい","n|vs|vt|vi","khử nước | vắt (đồ giặt) | mất nước (cơ thể)","dehydration | spinning (laundry)","1416540"),
    ("糊","のり","n","hồ | keo dán | hồ vải","paste | glue | clothing starch","1267400"),
    ("アイロン","アイロン","n","bàn ủi | bàn là | máy uốn tóc","iron (for pressing clothes) | hair iron","1014590"),
    ("布地","ぬのじ","n","vải | vải vóc | chất liệu vải","fabric | cloth | material","1591910"),
    ("化繊","かせん","n","sợi tổng hợp | sợi hóa học","synthetic fiber | chemical fibre","1187250"),
    ("合成","ごうせい","n|vs|vt|adj-no","tổng hợp | tổng hợp | ghép (ảnh)","composition | synthesis | composite photo","1284940"),
    ("格子","こうし","n","ô lưới | song cửa | hoa văn caro | mắt cáo","lattice | grid | check(ed) pattern","1205350"),
    ("水玉","みずたま","n|adj-no","giọt nước | họa tiết chấm bi","drop of water | polka dots","1371410"),
    ("装飾","そうしょく","n|vs|vt|adj-no","trang trí | trang hoàng | tô điểm","ornament | decoration","1402340"),
    ("調度","ちょうど","n","đồ dùng gia đình | đồ nội thất | vật dụng","household items | furniture | furnishings","1429280"),
    ("毛布","もうふ","n","chăn | mền","blanket","1533950"),
    ("照明","しょうめい","n|vs|vt","chiếu sáng | đèn chiếu sáng | ánh sáng","illumination | lighting","1350990"),
    ("空調","くうちょう","n","điều hòa không khí | máy lạnh","air conditioning","1245860"),
    ("水道","すいどう","n","nước máy | hệ thống cấp nước | eo biển | luồng nước","water supply | tap water | channel","1371920"),
    ("排水","はいすい","n|vs|vt|vi","thoát nước | tiêu nước | bơm nước ra","drainage | draining | displacement","1472380"),
    ("下水","げすい","n","nước thải | cống rãnh | hệ thống thoát nước","drainage | sewerage | sewage","1185510"),
    ("上水","じょうすい","n","nước sạch | nước cấp | nước máy","water supply | tap water","1353560"),
    ("浄水","じょうすい","n","nước sạch | nước đã lọc","clean water | purified water","1356640"),
    ("井戸","いど","n","giếng nước","water well","1160330"),
    ("蛇口","じゃぐち","n","vòi nước | vòi nước máy","faucet | tap","1323370"),
    ("配電","はいでん","n|vs|vt|vi","phân phối điện | cấp điện","distribution of electricity","1473160"),
    ("停電","ていでん","n|vs|vi","mất điện | cúp điện","power outage | power failure | blackout","1435020"),
    ("断熱","だんねつ","n|vs|vi|adj-no","cách nhiệt | cách ly nhiệt","insulation","1705010"),
    ("防水","ぼうすい","n|vs|vt|adj-no","chống thấm | chống nước","waterproofing | making watertight","1520490"),
    ("免震","めんしん","n|vs","cách chấn | giảm chấn nền móng | chống địa chấn","base isolation | seismic base isolation","2057390"),
    ("施錠","せじょう","n|vs|vt|vi","khóa | khóa cửa","locking","1310390"),
    ("防災","ぼうさい","n","phòng chống thiên tai | phòng tránh tai họa","disaster preparedness | protection against disaster","1520360"),
    ("避難","ひなん","n|vs|vi","lánh nạn | sơ tán | trú ẩn | tị nạn","taking refuge | evacuation | seeking shelter","1484660"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
