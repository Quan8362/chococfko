# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-035.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 13 persistent ghosts (1708890,2867035,2860958,2703560,2752960,2845086,2657290,2844618,2120840,2828178,2834858,2772160,2855262)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("失態","しったい","N3","n",
        "sai lầm | lỗi lầm | thất bại xấu hổ",
        "blunder | fault | error | mistake | failure | disgrace","1594430"),
    row("渋々","しぶしぶ","N3","adv|adv-to",
        "miễn cưỡng | không tự nguyện",
        "reluctantly | unwillingly","1594500"),
    row("収集","しゅうしゅう","N3","n|vs|vt",
        "sưu tập | thu thập | tập hợp | thu gom rác",
        "collecting | accumulating | gathering | collection (of art, stamps, insects, etc.) | garbage collection | waste collection","1594720"),
    row("執着","しゅうちゃく","N3","n|vs|vi",
        "sự gắn bó | cố chấp | ám ảnh | cưỡng cầu",
        "attachment | adhesion | insistence | tenacity | fixation | obsession | clinging (e.g. to old customs)","1594740"),
    row("習得","しゅうとく","N3","n|vs|vt",
        "học hỏi | tiếp thu | đạt được kỹ năng",
        "learning | acquisition (of a skill, knowledge, etc.)","1594750"),
    row("出版社","しゅっぱんしゃ","N3","n",
        "nhà xuất bản | công ty xuất bản",
        "publisher | publishing house | publishing company","1594870"),
    row("賞賛","しょうさん","N3","n|vs|vt",
        "khen ngợi | tán dương | tán thưởng | ngưỡng mộ",
        "praise | admiration | commendation | approbation | applause","1594920"),
    row("少量","しょうりょう","N3","n|adj-no|adj-na",
        "lượng nhỏ | số lượng ít | tí chút",
        "small quantity | small amount | narrowmindedness","1595030"),
    row("知り合い","しりあい","N3","n",
        "người quen | người quen biết",
        "acquaintance","1595070"),
    row("侵攻","しんこう","N3","n|vs|vt|vi",
        "xâm lược | tấn công xâm chiếm",
        "invasion","1595140"),
    row("侵略","しんりゃく","N3","n|vs|vt|vi",
        "xâm lược | cướp bóc | gây hấn",
        "invasion (e.g. of a country) | raid | aggression","1595200"),
    row("事態","じたい","N3","n",
        "tình hình | tình trạng | hoàn cảnh",
        "situation | (present) state of affairs | circumstances","1595240"),
    row("実情","じつじょう","N3","n",
        "tình trạng thực tế | hoàn cảnh thực tế",
        "real condition | actual circumstances | actual state of affairs","1595260"),
    row("従順","じゅうじゅん","N3","adj-na|n",
        "ngoan ngoãn | phục tùng | dễ bảo | hiền lành",
        "obedient | submissive | docile | meek | pliant","1595350"),
    row("絨毯","じゅうたん","N3","n",
        "thảm | thảm trải sàn",
        "carpet | rug | runner","1595370"),
    row("純朴","じゅんぼく","N3","adj-na",
        "chất phác | đơn giản và thật thà | ngây thơ",
        "simple and honest | unsophisticated | simpleminded | naive | unspoiled","1595430"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
