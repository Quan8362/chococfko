# -*- coding: utf-8 -*-
"""Writes jmdict-n5-vi-ready-008.csv in UTF-8."""
import os

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n5-vi-ready-008.csv"

HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"

LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    s = str(v)
    return '"' + s.replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id,
        ex_jp="", ex_rd="", ex_vi="", ex_en=""):
    return ",".join([
        q(word), q(reading), q(""), q(lvl), q(pos),
        q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"),
        q(ex_jp), q(ex_rd), q(ex_vi), q(ex_en),
        q("ai_draft"), q("jmdict_ai"),
    ])

ROWS = [
    row("曇り","くもり","N5","n","trời âm u | thời tiết âm u | sương mù (trên gương, kính) | vết mây (trong đá hoa) | mờ | bóng tối | u ám | ủ rũ | chán nản","cloudiness | cloudy weather | fog (on a mirror, glasses, etc.) | cloud (e.g. in marble) | blur | mist | shadow | dimness | gloom | dejection","1592340",
        "今日は曇りですね。","きょうはくもりですね。","Hôm nay trời âm u nhỉ.","It's cloudy today."),
    row("幸せ","しあわせ","N5","n|adj-na","hạnh phúc | may mắn | phúc lành","happiness | good fortune | luck | blessing","1594060",
        "幸せですか。","しあわせですか。","Bạn có hạnh phúc không?","Are you happy?"),
    row("仕方","しかた","N5","n","cách | phương pháp | phương tiện | nguồn lực | lộ trình","way | method | means | resource | course","1594110",
        "仕方がありません。","しかたがありません。","Không còn cách nào khác.","There is no other way."),
    row("台風","たいふう","N5","n","bão | bão nhiệt đới","typhoon | hurricane","1596780",
        "台風が来ます。","たいふうがきます。","Bão đang đến.","A typhoon is coming."),
    row("確か","たしか","N5","adj-na|adv","chắc chắn | nhất định | tích cực | đáng tin cậy | an toàn | chính xác | đúng | nếu tôi không nhầm | nếu tôi nhớ không lầm","sure | certain | positive | definite | reliable | trustworthy | safe | sound | firm | accurate | correct | exact | If I'm not mistaken | If I remember correctly | If I remember rightly","1596930",
        "確か、そこにあります。","たしか、そこにあります。","Chắc là ở đó.","It should be there, if I remember correctly."),
    row("別","わけ","N5","n","lãnh chúa (danh hiệu cha truyền con nối cho con cháu hoàng gia ở các vùng xa)","lord (hereditary title for imperial descendants in outlying regions)","2259830"),
    row("匂い","におい","N5","n","mùi | hương thơm | mùi hôi | mùi khó chịu | khí vị | hương vị","smell | scent | odour | odor | stench | aura | whiff | smack | flavour | flavor | mood | faint, mist-like pattern along the temper line of a Japanese sword","1599760",
        "いい匂いですね。","いいにおいですね。","Mùi thơm quá.","What a nice smell."),
    row("年齢","ねんれい","N5","n","tuổi | số tuổi","age | years","1600240",
        "年齢は何歳ですか。","ねんれいはなんさいですか。","Bạn bao nhiêu tuổi?","How old are you?"),
    row("激しい","はげしい","N5","adj-i","mãnh liệt | dữ dội | cuồng phong | cực độ | dữ dội | khốc liệt | mạnh | tha thiết | nhiệt thành | liên tục | không ngừng | dốc đứng","violent | furious | tempestuous | extreme | intense | fierce | strong | fervent | vehement | incessant | relentless | precipitous | steep","1600720",
        "激しい雨ですね。","はげしいあめですね。","Mưa dữ dội nhỉ.","What a violent rain."),
    row("引き出す","ひきだす","N5","v5s|vt","kéo ra | lấy ra | rút ra | dẫn ra (ví dụ ngựa từ chuồng) | triệu hồi (ví dụ ra tòa) | rút tiền | phát huy (tài năng, tiềm năng) | chiết xuất (thông tin) | lấy được (câu trả lời) | thu được (kết quả)","to pull out | to take out | to draw out | to lead out (e.g. a horse from a stable) | to summon (e.g. to court) | to bring (e.g. someone to the negotiating table) | to drag | to withdraw (money) | to draw | to bring out (talent, potential, beauty, flavour, etc.) | to extract (information, the truth, etc.) | to get (e.g. an answer out of someone) | to obtain (e.g. a result) | to elicit | to draw (a conclusion) | to derive (e.g. pleasure) | to get (money) out of someone | to coax out of someone | to get someone to pay | to make someone produce (funds)","1601660",
        "お金を引き出します。","おかねをひきだします。","Tôi rút tiền.","I withdraw money."),
    row("何人","なにびと","N5","pn","bất kỳ ai | bất kỳ người nào | ai cũng được","anyone | any person | whoever","2006130"),
    row("日","にち","N5","n|suf|ctr","Chủ nhật | ngày thứ n (của tháng) | đếm ngày | Nhật Bản","Sunday | nth day (of the month) | counter for days | Japan","2083100"),
    row("島","とう","N5","suf|n-suf|n","đảo | hòn đảo","Island | insula | island | islet","2085760"),
    row("強い","こわい","N5","adj-i","cứng | cứng rắn | khó | không linh hoạt | bướng bỉnh | kiên định | mệt mỏi | kiệt sức","tough | stiff | hard | inflexible | obstinate | stubborn | tired | worn out","2087680"),
    row("橋","きょう","N5","n","cầu não | pons Varolii","pons | pons Varolii","2151440"),
    row("月","げつ","N5","n","thứ Hai","Monday","2153740"),
    row("年","とせ","N5","ctr","đếm năm","counter for years","2220370"),
    row("外","がい","N5","suf","ngoài ... | vượt ra ngoài ... | không bao gồm trong ...","outside ... | beyond ... | not included in ...","2227930"),
    row("姉","し","N5","suf","hậu tố kính ngữ dùng sau tên phụ nữ có địa vị ngang hoặc cao hơn","honorific suffix used after the name of a woman of equal or higher status","2252800"),
    row("方","がた","N5","suf","quý vị | các bà | khoảng (thời gian đó) | khoảng","Sirs | Mesdames | around (the time that, etc.) | about","2253290"),
    row("左","さ","N5","n|adj-no","trái (đặc biệt trong chữ viết dọc tiếng Nhật) | như sau","left (esp. in vertical Japanese writing) | the following","2261470"),
    row("所","しょ","N5","suf|ctr","đếm nơi chốn (văn phòng, cơ sở, trạm)","counter for places (offices, facilities, stations)","2273780"),
    row("時","どき","N5","n-suf","thời điểm để ... | thời điểm tốt để ... | cơ hội để ... | mùa","time for ... | time to ... | good time to ... | opportunity to ... | season","2273940"),
    row("表す","ひょうす","N5","v5s|vt","biểu đạt | thể hiện","to express | to show","2410100",
        "気持ちを表します。","きもちをひょうします。","Tôi biểu đạt cảm xúc.","I express my feelings."),
    row("草","そう","N5","n","bản thảo | bản nháp | thể chữ thảo (kiểu viết chữ Hán cực thảo) | thể cỏ","draft | rough copy | highly cursive style (of writing Chinese characters) | grass style","2414580"),
    row("先生","シーサン","N5","n","đàn ông | cậu bé","man | boy","2727400"),
    row("二","アル","N5","num","hai","two","2728160"),
    row("三","サン","N5","num","ba","three","2747950"),
    row("四","スー","N5","num","bốn","four","2747960"),
    row("五","ウー","N5","num","năm","five","2747970"),
    row("六","リュー","N5","num","sáu","six","2747980"),
    row("車","しゃ","N5","suf|ctr","xe | phương tiện | xe tải | toa (tàu) | xe ngựa","car | vehicle | van | truck | wagon | lorry | (train) car | carriage","2773260"),
    row("大丈夫","だいじょうふ","N5","n","người đàn ông vĩ đại | người đàn ông đáng kính","great man | fine figure of a man","2825470"),
    row("お正月","おしょうがつ","N5","n","Tết Nguyên Đán (đặc biệt là 3 ngày đầu) | tháng đầu năm | tháng Một","New Year (esp. first three days) | first month of the year | January","2826498",
        "お正月が楽しみです。","おしょうがつがたのしみです。","Tôi mong đến Tết.","I'm looking forward to New Year."),
    row("忙しい","せわしい","N5","adj-i","bận rộn | hối hả | cuống cuồng | bồn chồn | vội vã | bứt rứt","busy | hectic | frantic | restless | hurried | fidgety","2835296",
        "毎日忙しいです。","まいにちせわしいです。","Ngày nào cũng bận rộn.","Every day is busy."),
    row("歯","し","N5","n","răng | tuổi | số năm","tooth | age | years","2842986"),
    row("声","しょう","N5","n","giọng nói | âm thanh | thanh điệu (của chữ Hán) | dấu thanh | trọng âm | ngữ điệu | giọng","voice | sound | tone (of Chinese character) | tone mark | stress (in pronunciation) | intonation | accent","2843115"),
    row("髪","はつ","N5","n","(một) sợi tóc","(a) hair","2843553"),
    row("肉","しし","N5","n","thịt (đặc biệt là thịt động vật) | thịt","flesh (esp. of an animal) | meat","2849347"),
    row("一日","ひとひ","N5","n|adv","một ngày | cả ngày | ngày mùng 1 (của tháng)","one day | all day (long) | the whole day | 1st day of the month","2852123"),
    row("妻","つま","N5","n","người yêu dấu | em yêu | cưng","my dear | dear | honey","2852371"),
    row("リーダー","リーダー","N5","n","sách giáo khoa đọc | người đọc | máy đọc vi phim","reader (textbook) | reader (i.e. a person who reads) | microreader","2857529"),
    row("家","ち","N5","suf","nhà của ... | nơi ở của ...","'s house | 's home","2858378"),
    row("怒る","いかる","N5","v5r|vi","nổi giận | tức giận | có góc cạnh | vuông vắn","to get angry | to get mad | to be angular | to be square","2859682",
        "どうして怒るのですか。","どうしていかるのですか。","Tại sao bạn tức giận?","Why do you get angry?"),
    row("眼鏡","がんきょう","N5","n","kính mắt | mắt kính | kính","glasses | eyeglasses | spectacles","2862467",
        "眼鏡をかけます。","がんきょうをかけます。","Tôi đeo kính.","I wear glasses."),
    row("夫","ふ","N5","n-suf","(người) lao động | công nhân","(working) man | laborer","2870787"),
    row("道","タオ","N5","n","Đạo | nguyên lý cơ bản của vũ trụ (trong Đạo giáo)","Tao | Dao | fundamental principle of the universe (in Taoism)","2870839"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print(f"Written {len(ROWS)} rows + header to {OUT}")
