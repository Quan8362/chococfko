# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-030.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("暗黒","あんこく","N3","n|adj-no|adj-na",
        "bóng tối | tăm tối | đen tối",
        "darkness","1586920"),
    row("生き方","いきかた","N3","n",
        "cách sống | lối sống",
        "way of life | how to live","1587100"),
    row("育成","いくせい","N3","n|vs|vt",
        "nuôi dưỡng | đào tạo | phát triển | xúc tiến",
        "rearing | training | nurture | cultivation | promotion","1587150"),
    row("生け花","いけばな","N3","n",
        "cắm hoa nghệ thuật Nhật Bản | ikebana | bình hoa",
        "ikebana | Japanese art of flower arrangement | fresh flower | natural flower","1587180"),
    row("意向","いこう","N3","n",
        "ý định | ý muốn | quan điểm | mong muốn",
        "intention | inclination | mind | idea | wish | view","1587200"),
    row("萎縮","いしゅく","N3","n|vs|vi",
        "teo lại | thu nhỏ | tàn lụi | co rút | bị thụt lùi",
        "withering | shrivelling | shrinking | contraction | atrophy","1587220"),
    row("痛々しい","いたいたしい","N3","adj-i",
        "đáng thương | tội nghiệp | đau lòng (khi nhìn thấy)",
        "pitiful | pathetic | painful (to look at)","1587270"),
    row("命からがら","いのちからがら","N3","adv",
        "cố sống cố chết | thoát chết trong gang tấc",
        "for dear life | barely escaping alive","1587540"),
    row("意欲","いよく","N3","n",
        "ý chí | khát vọng | sự nhiệt tình | động lực | tham vọng",
        "will | desire | eagerness | interest | drive | motivation | urge | ambition","1587690"),
    row("威力","いりょく","N3","n",
        "quyền lực | sức mạnh | uy lực | ảnh hưởng",
        "power | might | authority | influence","1587770"),
    row("入れ墨","いれずみ","N3","n|vs",
        "hình xăm | xăm mình",
        "tattoo (esp. a traditional Japanese one) | tattooing","1587810"),
    row("陰影","いんえい","N3","n",
        "bóng | bóng mờ | sắc thái | tế nhị | ý nghĩa ẩn",
        "shadow | shade | shading | gloom | nuance | shades of meaning | subtleties","1587880"),
    row("因習","いんしゅう","N3","n",
        "phong tục cũ | tập quán lỗi thời | truyền thống cứng nhắc",
        "convention | tired tradition | old custom","1587900"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
