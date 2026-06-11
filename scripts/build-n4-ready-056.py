# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-056.csv -- 4 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-056.csv"
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
    row("せめて","せめて","N4","adv",
        "ít nhất là | tối đa là | (dù chỉ) một chút",
        "at least | at most | (even) just",
        "1006570",
        "せめて一度は会いたい。","せめていちどはあいたい。",
        "Ít nhất muốn gặp một lần.","I want to meet at least once."),
    row("押さえる","おさえる","N4","v1|vt",
        "ghim xuống | giữ xuống | ấn xuống | giữ cố định | giữ ổn định | che (phần thân bằng tay) | bóp chặt (bộ phận đau) | ấn (bộ phận) | nắm lấy | có được | chiếm lấy | bắt | bắt giữ | nắm vững (vấn đề) | hiểu | đặt trước (thời gian/không gian) | giữ | chặn (lịch) | đảm bảo | xác định (ngày) | dập tắt | chế phục | đàn áp | kiềm chế | kiềm lại | kiểm tra | hạn chế | chứa đựng",
        "to pin down | to hold down | to press down | to hold in place | to hold steady | to cover (esp. a part of one's body with one's hand) | to clutch (a body part in pain) | to press (a body part) | to get a hold of | to obtain | to seize | to catch | to arrest | to grasp (a point) | to comprehend | to reserve (time, space, or availability) | to hold | to block off (a schedule) | to secure | to pin down (a date) | to quell | to subdue | to suppress | to repress | to hold back | to check | to curb | to contain",
        "1589080",
        "肩を押さえる。","かたをおさえる。",
        "Giữ vai lại.","Hold down the shoulders."),
    row("握る","にぎる","N4","v5r|vt",
        "nắm | bắt | giữ chặt | nắm chặt | nắm giữ (câu trả lời) | có (giải pháp) | là chìa khóa | là lý do | giành lấy (quyền lực) | nắm giữ (cương vị) | thống trị | kiểm soát | nặn (sushi nigiri/cơm nắm) | tạo hình bằng tay | ép thành hình | đúc khuôn | nắn thành khuôn",
        "to clasp | to grasp | to grip | to clutch | to hold (the answer) | to have (e.g. the solution) | to be the key | to be the reason | to seize (power) | to hold (the reins) | to dominate | to control | to make (nigirizushi, rice ball, etc.) | to form (with one's hands) | to press into shape | to mold | to mould",
        "1152720",
        "ハンドルを握る。","はんどるをにぎる。",
        "Nắm lấy tay lái.","Grip the steering wheel."),
    row("詰める","つめる","N4","v1|vt|vi|aux-v",
        "nhồi vào | nhét chặt | dồn vào | đóng gói | lấp đầy | bịt | bịt kín | rút ngắn | dịch sát lại | giảm (chi tiêu) | tiết kiệm | tập trung vào | cố sức làm | xem xét kỹ | làm rõ (chi tiết) | đưa đến kết luận | kết thúc | trực ca | đóng trú | dồn vào góc (quân vua shogi) | bẫy | chiếu hết | cắt ngón tay (để xin lỗi) | kẹp (ngón tay vào cửa) | làm liên tục | làm không ngừng | tiếp tục làm không nghỉ | làm hoàn toàn | làm triệt để | dồn ai vào tình huống khó khăn bằng...",
        "to stuff into | to jam | to cram | to pack | to fill | to plug | to stop up | to shorten | to move closer together | to reduce (spending) | to conserve | to focus intently on | to strain oneself to do | to go through thoroughly | to work out (details) | to bring to a conclusion | to wind up | to be on duty | to be stationed | to corner (esp. an opponent's king in shogi) | to trap | to checkmate | to cut off (one's finger as an act of apology) | to catch (one's finger in a door, etc.) | to do non-stop | to do continuously | to keep doing (without a break) | to do completely | to do thoroughly | to force someone into a difficult situation by ...",
        "1226510",
        "荷物を詰める。","にもつをつめる。",
        "Nhồi hành lý vào.","Pack luggage in."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
