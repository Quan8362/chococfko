# -*- coding: utf-8 -*-
"""Build N2 ready wave 010 — adjectives (na/i) describing magnitude, condition, character."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-010.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("艶やか","つややか","adj-na","bóng mượt | óng ả | láng bóng","glossy | sleek | lustrous","2682080"),
    ("明らか","あきらか","adj-na","rõ ràng | hiển nhiên | sáng tỏ","clear | obvious | evident","1532310"),
    ("柔らか","やわらか","adj-na","mềm | mềm mại | dịu | linh hoạt","soft | tender | supple | gentle","1460730"),
    ("清らか","きよらか","adj-na","trong sạch | thanh khiết | trong trẻo | thuần khiết","clean | pure | innocent | chaste","1378180"),
    ("平ら","たいら","adj-na|n-suf","bằng phẳng | phẳng lặng | điềm tĩnh | ngồi thoải mái","flat | level | calm | composed","1506930"),
    ("円やか","まろやか","adj-na","tròn trịa | êm dịu | dịu vị | mượt","round | mellow | mild | smooth","1175600"),
    ("気がかり","きがかり","n|adj-na","lo lắng | bận tâm | canh cánh","worry | anxiety | concern","1222020"),
    ("程遠い","ほどとおい","adj-i","xa xôi | còn lâu mới | cách xa","far away | far off | nowhere near","1735870"),
    ("程近い","ほどちかい","adj-i","gần | gần kề | không xa","near | nearby | not far off","1436530"),
    ("悩ましい","なやましい","adj-i","gợi tình | day dứt | nan giải | bứt rứt","seductive | troubling | thorny | uneasy","1469830"),
    ("壮大","そうだい","adj-na|n","hùng vĩ | tráng lệ | nguy nga","magnificent | grand | majestic","1399430"),
    ("雄大","ゆうだい","adj-na|n","hùng vĩ | hoành tráng | cao cả","grand | magnificent | sublime","1542540"),
    ("広大","こうだい","adj-na|n","rộng lớn | bao la | mênh mông","vast | extensive | immense","1278600"),
    ("盛大","せいだい","adj-na|n","long trọng | hoành tráng | thịnh vượng","grand | magnificent | lavish | thriving","1379820"),
    ("偉大","いだい","adj-na","vĩ đại | lớn lao | xuất chúng","great | grand | outstanding","1155920"),
    ("過大","かだい","adj-na","quá lớn | quá mức | quá đáng","excessive | too much","1196250"),
    ("過小","かしょう","adj-na","quá nhỏ | quá ít","too small | too little","1196140"),
    ("露呈","ろてい","n|vs|vt|vi","phơi bày | bộc lộ | để lộ","exposure | disclosure","1560160"),
    ("好調","こうちょう","adj-na|adj-no|n","thuận lợi | suôn sẻ | phong độ tốt","favourable | promising | in good shape","1277730"),
    ("不調","ふちょう","n|adj-no|adj-na","trục trặc | sa sút phong độ | đổ vỡ (đàm phán)","bad condition | slump | breakdown","1493840"),
    ("低調","ていちょう","adj-na|n","trì trệ | uể oải | ảm đạm | yếu (thị trường)","inactive | sluggish | dull","1434610"),
    ("単調","たんちょう","adj-na|n","đơn điệu | tẻ nhạt | nhàm chán","monotony | monotonous | dull","1417760"),
    ("強硬","きょうこう","adj-na|n","cứng rắn | kiên quyết | không nhượng bộ","firm | unbending | hard-line","1236250"),
    ("卑怯","ひきょう","adj-na|n","hèn nhát | hèn hạ | chơi xấu | đê tiện","cowardly | unfair | sneaky","1482710"),
    ("不誠実","ふせいじつ","adj-na|n","không thành thật | giả dối | thiếu trung thực","insincerity | dishonesty | bad faith","1493530"),
    ("不真面目","ふまじめ","adj-na|n","không nghiêm túc | hời hợt | bê tha","not serious | frivolous | insincere","1493160"),
    ("薄情","はくじょう","adj-na|n","bạc tình | nhẫn tâm | lạnh lùng","unfeeling | heartless | cold-hearted","1475600"),
    ("無慈悲","むじひ","adj-na|n","tàn nhẫn | không thương xót | nhẫn tâm","merciless | ruthless | pitiless","1530060"),
    ("無情","むじょう","n|adj-na|adj-no","vô tình | nhẫn tâm | tàn nhẫn | vô tri","heartlessness | coldheartedness | cruelty","1530170"),
    ("朗報","ろうほう","n","tin vui | tin lành | tin tốt","good news | glad tidings","1560740"),
    ("悲報","ひほう","n","tin buồn | tin dữ | tin báo tử","sad news | death notice","1483340"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
