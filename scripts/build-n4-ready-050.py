# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-050.csv -- 11 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-050.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

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
    row("帰り道","かえりみち","N4","n",
        "đường về nhà | đường quay về | chặng về",
        "the way back | the way home | return trip",
        "1221260",
        "帰り道に寄る。","かえりみちによる。",
        "Ghé qua trên đường về nhà.","Stop by on the way home."),
    row("見晴らし","みはらし","N4","n",
        "tầm nhìn | cảnh quan | nơi ngắm cảnh | đài quan sát",
        "(scenic) view | prospect | outlook | viewing platform | overlook",
        "1259770",
        "見晴らしがいい。","みはらしがいい。",
        "Tầm nhìn đẹp.","Have a great view."),
    row("憎む","にくむ","N4","v5m|vt",
        "ghét | căm ghét | thù ghét",
        "to hate | to detest",
        "1403440",
        "不正を憎む。","ふせいをにくむ。",
        "Ghét bỏ sự bất công.","Hate injustice."),
    row("派手","はで","N4","adj-na|n",
        "lòe loẹt | phô trương | sặc sỡ | hào nhoáng",
        "showy | loud | flashy | gaudy | flamboyant | garish | ostentatious",
        "1471140",
        "派手な色使い。","はでないろづかい。",
        "Màu sắc sặc sỡ.","Flashy use of color."),
    row("浜辺","はまべ","N4","n",
        "bãi biển | bờ biển | bờ cát",
        "beach | foreshore",
        "1490720",
        "浜辺を散歩する。","はまべをさんぽする。",
        "Đi dạo dọc bờ biển.","Walk along the beach."),
    row("地味","ちみ","N4","n",
        "độ màu mỡ của đất | chất lượng đất | độ phì nhiêu",
        "soil fertility | soil quality | productivity of the soil",
        "1763590",
        "地味が豊かな土地。","ちみがゆたかなとち。",
        "Đất đai màu mỡ phì nhiêu.","Land with rich soil fertility."),
    row("日当たり","ひあたり","N4","n",
        "chỗ nắng | nơi có nhiều nắng | theo ngày | hàng ngày",
        "exposure to the sun | sunny place | per day",
        "1601420",
        "日当たりのいい部屋。","ひあたりのいいへや。",
        "Phòng nhiều nắng.","A sunny room."),
    row("湖畔","こはん","N4","n",
        "bờ hồ | ven hồ",
        "lakeside | lakeshore | lakefront",
        "1267320",
        "湖畔の宿。","こはんのやど。",
        "Nhà trọ ven hồ.","An inn by the lakeside."),
    row("素朴","そぼく","N4","adj-na|n",
        "giản dị | đơn giản | chất phác | mộc mạc",
        "simple | artless | naive | unsophisticated | rustic",
        "1397390",
        "素朴な味わい。","そぼくなあじわい。",
        "Hương vị giản dị mộc mạc.","A simple, rustic flavor."),
    row("草木","くさき","N4","n",
        "cây cỏ | thực vật | cây xanh",
        "plants | vegetation",
        "1581300",
        "草木が茂る。","くさきがしげる。",
        "Cây cỏ um tùm.","Vegetation grows thick."),
    row("河原","かわら","N4","n",
        "bãi đá sông | lòng sông khô | bãi sỏi ven sông",
        "dry riverbed | river beach | gravel riverbed",
        "1590760",
        "河原で遊ぶ。","かわらであそぶ。",
        "Chơi ở bãi đá sông.","Play on the riverbed."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
