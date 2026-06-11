# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-031.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("裏付け","うらづけ","N3","n",
        "bằng chứng hỗ trợ | xác nhận | chứng minh | đảm bảo",
        "support (e.g. for an argument) | backing | proof | evidence | corroboration | substantiation","1588450"),
    row("売り上げ","うりあげ","N3","n",
        "doanh số | doanh thu | tiền bán được | kim ngạch",
        "amount sold | sales | proceeds | takings | turnover","1588500"),
    row("埋め合わせる","うめあわせる","N3","v1|vt",
        "bù đắp | bồi thường | bù lại",
        "to make up for | to compensate for | to offset","1588420"),
    row("運送","うんそう","N3","n|vs|vt",
        "vận chuyển | vận tải | giao hàng",
        "transport | freight | shipping | moving (goods)","1588620"),
    row("英才","えいさい","N3","n",
        "thiên tài | tài năng xuất chúng | người tài giỏi",
        "genius | brilliance | unusual talent | gifted person | person of unusual talent","1588660"),
    row("英知","えいち","N3","n",
        "trí tuệ | sự thông thái | sáng suốt",
        "wisdom | intelligence | sagacity","1588680"),
    row("援護","えんご","N3","n|vs|vt",
        "hỗ trợ | giúp đỡ | bảo vệ | che chắn | yểm trợ",
        "support | help | backing | covering (from enemy attack) | protection","1588790"),
    row("追い風","おいかぜ","N3","n",
        "gió xuôi | điều kiện thuận lợi | tình thế có lợi",
        "tailwind | fair wind | favorable wind (favourable) | favorable condition | advantageous situation","1588800"),
    row("大げさ","おおげさ","N3","adj-na",
        "phóng đại | cường điệu | thổi phồng | kịch tính quá mức",
        "exaggerated | overdone | overblown | hyperbolic | bombastic | grandiose","1588890"),
    row("憶測","おくそく","N3","n|vs|vt",
        "phỏng đoán | suy đoán | ức đoán | giả thiết",
        "guess | speculation | supposition","1589020"),
    row("行い","おこない","N3","n",
        "hành vi | hành động | đạo đức | cách cư xử",
        "deed | act | action | conduct | behavior | behaviour | asceticism","1589050"),
    row("思い出","おもいで","N3","n",
        "ký ức | hồi ức | kỷ niệm",
        "memories | recollections | reminiscence","1589340"),
    row("折り紙","おりがみ","N3","n",
        "gấp giấy origami | nghệ thuật gấp giấy | chứng nhận xác thực",
        "origami | art of paper folding | hallmark | certificate of authenticity","1589450"),
    row("恩義","おんぎ","N3","n",
        "nghĩa vụ | ơn huệ | ơn nghĩa | nợ ân tình",
        "obligation | favour | favor | debt of gratitude","1589610"),
    row("火炎","かえん","N3","n",
        "ngọn lửa | ngọn lửa bùng cháy",
        "flame | blaze","1589790"),
    row("香り","かおり","N3","n",
        "mùi thơm | hương thơm | mùi hương",
        "aroma | fragrance | scent | smell","1589820"),
    row("関わり","かかわり","N3","n",
        "mối quan hệ | sự liên quan | kết nối",
        "relation | connection","1589870"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
