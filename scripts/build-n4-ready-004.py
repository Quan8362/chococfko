# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-004.csv in UTF-8 — 6 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-004.csv"
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
    row("掛ける","かける","N4","v1|vt|suf",
        "treo lên | để treo | treo (từ) | ngồi (lên) | phủ lên | đặt (lên) | đặt cược | tiêu tốn (tiền, thời gian) | nói chuyện (với ai) | đặt câu hỏi | gọi điện | rắc (muối) | nhân (toán học) | gây rắc rối | vận hành (máy) | thực hiện (phép toán)",
        "to hang up (e.g. a coat, a picture on the wall) | to let hang | to suspend (from) | to hoist | to lower | to hook onto | to sit on | to cover (e.g. with a blanket) | to place (something on top of something else) | to set (e.g. an alarm, a lock) | to bet | to risk | to wager | to put at stake | to call | to spend | to make a call | to talk (to) | to say (to) | to cast (a spell, etc.) | to hang (a door, etc.) | to apply (e.g. a seal) | to multiply (arithmetic)",
        "1207610",
        "コートを掛けます。","コートをかけます。","Tôi treo áo khoác.","I hang up my coat."),
    row("過ぎる","すぎる","N4","v1|vi|suf",
        "đi qua | đi ngang qua | vượt qua | trôi qua (thời gian) | quá mức | quá (tiền tố nghĩa quá-)",
        "to pass through | to pass by | to go beyond | to pass (of time) | to elapse | to have had too much | to have had too many | to go too far | to turn (e.g. 30 years old) | to exceed | to be too (much) | to be over-",
        "1195970",
        "時間が過ぎました。","じかんがすぎました。","Thời gian đã trôi qua.","Time has passed."),
    row("外す","はずす","N4","v5s|vt",
        "tháo ra | cởi ra | gỡ ra | mở ra | tháo (ví dụ nút áo) | bỏ lỡ | vuột mất | loại (khỏi danh sách) | rời khỏi (chỗ ngồi) | trốn thoát",
        "to remove | to take off | to detach | to unfasten | to undo | to drop (e.g. from a team) | to leave (e.g. one's seat) | to escape | to miss (a target) | to overlook | to miss (an opportunity)",
        "1203270",
        "眼鏡を外します。","めがねをはずします。","Tôi tháo kính ra.","I take off my glasses."),
    row("中心","ちゅうしん","N4","n|adj-no|suf",
        "trung tâm | trung điểm | giữa | cốt lõi | trọng tâm | điểm tựa | nhấn mạnh | thăng bằng",
        "center | centre | middle | heart | core | focus | pivot | emphasis | balance",
        "1424550",
        "都市の中心に住んでいます。","としのちゅうしんにすんでいます。","Tôi sống ở trung tâm thành phố.","I live in the center of the city."),
    row("普通","ふつう","N4","adj-no|adj-na|adv|n",
        "bình thường | thông thường | thường xuyên | thông dụng | thường | bình quân",
        "normal | ordinary | regular | usual | common | average | normally | ordinarily | usually | typically | generally",
        "1497190",
        "普通の生活です。","ふつうのせいかつです。","Cuộc sống bình thường.","It's an ordinary life."),
    row("負ける","まける","N4","v1|vi|vt",
        "thua | bị đánh bại | thất bại | chịu thua (ai) | nhượng bộ | giảm giá | cho hưởng giá tốt",
        "to lose | to be defeated | to be beaten | to give in (to) | to yield | to succumb | to discount | to give a discount | to reduce (a price)",
        "1497980",
        "試合に負けました。","しあいにまけました。","Tôi thua trận đấu.","I lost the match."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
