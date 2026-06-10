# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-014.csv — 16 rows (complex-meaning verbs)."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-014.csv"
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
    row("ポイント","ポイント","N4","n|vs|vt",
        "điểm chính (của câu chuyện, lập luận) | điểm mấu chốt | điểm | địa điểm | điểm (tính điểm) | điểm (khách hàng thân thiết) | điểm phần trăm | điểm thập phân | đường ray chuyển | chỉ ra",
        "point (of a story, argument, etc.) | key point | important part | point | site | spot | point (in scoring) | point (in a loyalty program) | (percentage) point | (decimal) point | switch | to point (at)",
        "1124860",
        "ポイントを理解します。","ポイントをりかいします。","Tôi hiểu điểm mấu chốt.","I understand the key point."),
    row("監督","かんとく","N4","n|vs|vt",
        "giám sát | kiểm soát | quản lý | chỉ đạo | đạo diễn | tổng giám thị | giám sát viên | huấn luyện viên | tổ trưởng | người điều hành",
        "supervision | control | superintendence | direction | director | superintendent | supervisor | coach | foreman | manager | overseer | controller | boss",
        "1213720",
        "監督が指示します。","かんとくがしじします。","Đạo diễn đưa ra chỉ thị.","The director gives instructions."),
    row("苦しい","くるしい","N4","adj-i|suf",
        "đau đớn | khó khăn | gian khổ | cực nhọc | đau khổ | khó khăn (về tâm lý) | căng thẳng | khó xử | hoàn cảnh eo hẹp | tình hình tài chính khó khăn | gượng gạo | không thuyết phục | khó chịu",
        "painful | difficult | tough | hard | distressing | (psychologically) difficult | stressful | awkward (e.g. position) | straitened (circumstances) | tight (financial situation) | forced (e.g. smile) | far-fetched | unpleasant",
        "1244320",
        "生活が苦しいです。","せいかつがくるしいです。","Cuộc sống khó khăn.","Life is hard."),
    row("見送る","みおくる","N4","v5r|vt",
        "tiễn (ai đó) | hộ tống | nhìn theo (ai đó) | để qua | bỏ lỡ (cơ hội) | trì hoãn | gác lại | chăm sóc (ai đó) đến lúc qua đời | dự tang lễ",
        "to see (someone) off | to escort | to watch (someone or something) go out of sight | to let pass | to pass up (an opportunity) | to postpone | to put off | to shelve | to take care of (someone) until death | to attend (someone's) funeral",
        "1259830",
        "友達を見送ります。","ともだちをみおくります。","Tôi tiễn bạn bè.","I see off my friend."),
    row("盛る","もる","N4","v5r|vt",
        "bày (vào bát, đĩa) | múc ra | dọn lên | đổ đầy (bát) | chất đống | xếp chồng lên | cho dùng (thuốc) | kê đơn | thêm thắt | trang điểm đậm",
        "to serve (in a bowl, on a plate, etc.) | to dish out | to dish up | to fill (a bowl) with | to pile up | to heap up | to stack up | to administer (medicine, poison) | to prescribe | to exaggerate | to apply heavy makeup",
        "1379740",
        "ご飯を盛ります。","ごはんをもります。","Tôi dọn cơm vào bát.","I serve rice in a bowl."),
    row("叩く","たたく","N4","v5k|vt",
        "đập | đánh | đánh mạnh | gõ | vỗ | tát | vỗ nhẹ | vỗ tay | chơi (trống) | tấn công | chỉ trích | khiển trách | ném đá (trên Internet) | thăm dò (ý kiến) | dìm giá",
        "to strike | to hit | to beat | to knock | to pound | to bang | to slap | to tap | to pat | to clap (one's hands) | to play (the drums) | to attack | to criticize | to censure | to flame (on the Internet) | to sound out (someone's views) | to beat down the price",
        "1416170",
        "ドアを叩きます。","ドアをたたきます。","Tôi gõ cửa.","I knock on the door."),
    row("移す","うつす","N4","v5s|vt",
        "chuyển (đến nơi, nhóm khác) | thay đổi | di chuyển (cái gì đó) | hoán đổi | di dời | chuyển sang giai đoạn tiếp theo | chuyển hướng (sự chú ý) | trải qua (thời gian) | lây nhiễm (ai đó) | lây lan (nhiễm trùng) | thấm vào (màu sắc, mùi hương)",
        "to transfer (to a different place, group, etc.) | to change | to move (something) | to swap | to relocate | to move to the next stage | to divert (one's attention) to | to spend (time) | to infect (someone) | to spread (an infection) | to permeate (something; with a color or smell)",
        "1158160",
        "注意を移します。","ちゅういをうつします。","Tôi chuyển hướng sự chú ý.","I divert my attention."),
    row("移る","うつる","N4","v5r|vi",
        "di chuyển (sang nơi hoặc trạng thái khác) | thay đổi | được chuyển | lan ra (của lửa, mùi) | bị bắt (bệnh) | bị nhiễm | lây nhiễm | chuyển (ví dụ trọng tâm) | thấm (màu sắc, mùi hương) | trôi qua (thời gian)",
        "to move (to another place or state) | to change (e.g. of state, affiliation, scenery, etc.) | to be transferred | to spread (of a fire, smell, etc.) | to catch (an illness) | to be infected | to be contagious | to move (e.g. of one's focus) | to be permeated (by a color or scent) | to pass (of time)",
        "1158210",
        "新しい会社に移ります。","あたらしいかいしゃにうつります。","Tôi chuyển sang công ty mới.","I transfer to a new company."),
    row("飾る","かざる","N4","v5r|vt",
        "trang trí | trang hoàng | tô điểm | trưng bày | triển lãm | phô diễn | sắp xếp | đánh dấu (ví dụ ngày bằng chiến thắng) | tô điểm (ví dụ trang nhất) | giả vờ (cử chỉ) | giữ bộ mặt | thêm thắt | ăn mặc đẹp",
        "to decorate | to ornament | to adorn | to display | to exhibit | to put on show | to arrange | to mark (e.g. the day with a victory) | to adorn (e.g. the front page) | to affect (a manner) | to keep up (appearances) | to embellish | to dress up",
        "1357210",
        "部屋を飾ります。","へやをかざります。","Tôi trang trí phòng.","I decorate the room."),
    row("認める","みとめる","N4","v1|vt",
        "nhận ra | công nhận | quan sát | chú ý | cho rằng | phán xét | phê duyệt | coi là chấp nhận được | cho phép | thừa nhận | chấp nhận | thú nhận (tội danh) | tôn vinh | khen ngợi",
        "to recognize | to recognise | to observe | to notice | to deem | to judge | to assess | to approve | to allow | to admit | to accept | to confess (to a charge) | to renown | to acknowledge",
        "1467530",
        "間違いを認めます。","まちがいをみとめます。","Tôi thừa nhận lỗi lầm.","I admit the mistake."),
    row("傷","きず","N4","n",
        "vết thương | thương tích | vết cắt | vết rách | bầm tím | trầy xước | sẹo | sứt mẻ | nứt | khuyết điểm | vết nhơ (danh tiếng) | nhục nhã | đau (về cảm xúc)",
        "wound | injury | cut | gash | bruise | scratch | scrape | scar | chip | crack | flaw | defect | weak point | stain (on one's reputation) | disgrace | (emotional) hurt",
        "1580260",
        "傷が痛いです。","きずがいたいです。","Vết thương đau.","The wound hurts."),
    row("怪しい","あやしい","N4","adj-i",
        "đáng ngờ | mơ hồ | đáng hoài nghi | lén lút | bí ẩn | không chắc | kỳ lạ | ma quái | đáng gờm | nguy hiểm | huyền bí | quyến rũ | mê hoặc",
        "suspicious | dubious | questionable | dodgy | shady | fishy | doubtful | uncertain | strange | weird | eerie | spooky | ominous | dangerous | mysterious | bewitching | alluring",
        "1586700",
        "怪しい人がいます。","あやしいひとがいます。","Có người đáng ngờ.","There is a suspicious person."),
    row("気がつく","きがつく","N4","exp|v5k",
        "chú ý | nhận ra | nhận thức được | trở nên nhận thức | cảm nhận | cảm thấy | nghi ngờ | chú tâm | quan sát tốt | phục hồi ý thức | tỉnh lại",
        "to notice | to realize | to realise | to become aware (of) | to perceive | to sense | to suspect | to be attentive | to be observant | to regain consciousness | to come to (one's senses)",
        "1591050",
        "間違いに気がつきます。","まちがいにきがつきます。","Tôi nhận ra lỗi lầm.","I notice the mistake."),
    row("心","しん","N4","n",
        "trái tim | tâm trí | tinh thần | sức sống | sức mạnh nội tâm | đáy lòng | cốt lõi (của tính cách) | bản tính | trung tâm | lõi | tim (cơ quan) | người bạn",
        "heart | mind | spirit | vitality | inner strength | bottom of one's heart | core (of one's character) | nature | centre | center | core | heart (organ) | friend",
        "1595125",
        "心が大切です。","しんがたいせつです。","Tâm hồn là quan trọng.","The heart is important."),
    row("伸ばす","のばす","N4","v5s|vt",
        "để dài ra (ví dụ tóc, móng) | kéo dài | mở rộng | giãn ra | vươn tay | thẳng ra | trải phẳng | phủ đều (bột, kem) | pha loãng | trì hoãn | tăng cường | phát triển",
        "to grow long (e.g. hair, nails) | to lengthen | to extend | to stretch | to reach out | to straighten | to smooth out | to spread evenly (dough, cream, etc.) | to dilute | to postpone | to strengthen | to develop | to expand",
        "1600290",
        "髪を伸ばします。","かみをのばします。","Tôi để tóc dài.","I grow my hair long."),
    row("広げる","ひろげる","N4","v1|vt",
        "trải rộng | kéo dài | mở rộng | phóng to | nới rộng | mở mang | mở ra | cuộn ra | bỏ gói | rải rác | lan rộng | làm cho phát triển | làm cho thịnh vượng",
        "to spread | to extend | to expand | to enlarge | to widen | to broaden | to unfold | to open | to unroll | to unwrap | to scatter about | to make flourish | to cause to prosper",
        "1602370",
        "ビジネスを広げます。","ビジネスをひろげます。","Tôi mở rộng kinh doanh.","I expand the business."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
