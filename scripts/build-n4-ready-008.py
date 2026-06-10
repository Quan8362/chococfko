# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-008.csv — 13 rows (complex-meaning words)."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-008.csv"
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
    row("踏む","ふむ","N4","v5m|vt",
        "giẫm lên | đạp lên | chà đạp lên | đặt chân lên (ví dụ đất nước ngoài) | đứng lên | trải nghiệm | trải qua | tuân theo (quy tắc, nguyên tắc) | đi qua (ví dụ thủ tục) | ước tính | đoán | thẩm định | vần thơ | kế vị (ví dụ ngai vàng)",
        "to step on | to tread on | to trample on | to set foot on (e.g. foreign soil) | to stand on | to experience | to undergo | to follow (rules, principles, etc.) | to go through (e.g. formalities) | to estimate | to guess | to appraise | to rhyme | to succeed to (e.g. the throne)",
        "1450270",
        "大地を踏む。","だいちをふむ。","Đặt chân lên mặt đất.","I set foot on the ground."),
    row("引っ張る","ひっぱる","N4","v5r|vt",
        "kéo | giật | kéo chặt | giăng (dây) | kéo (cáp) | căng ra | kéo về phía mình | lôi kéo | kéo lê | dẫn đầu | đưa ai đó đến đâu đó | lôi kéo tham gia | trì hoãn | kéo dài | trích dẫn | viện dẫn | mặc vào",
        "to pull | to draw | to pull tight | to string (lines) | to run (cable) | to stretch | to pull towards oneself | to drag | to haul | to tow | to lead | to take someone somewhere | to tempt into joining | to delay | to prolong | to quote | to cite | to wear | to put on",
        "1601900",
        "ロープを引っ張ります。","ロープをひっぱります。","Tôi kéo sợi dây.","I pull the rope."),
    row("招く","まねく","N4","v5k|vt",
        "mời | ra hiệu mời vào | vẫy tay mời vào | gọi vào | triệu tập | tự chuốc lấy | gây ra | dẫn đến | đưa đến kết quả",
        "to invite | to ask | to beckon | to wave someone in | to gesture to | to call in | to summon | to bring on oneself | to cause | to incur | to lead to | to result in",
        "1349590",
        "友人を招きます。","ゆうじんをまねきます。","Tôi mời bạn bè.","I invite my friend."),
    row("代表","だいひょう","N4","n|vs|vt",
        "đại diện | người đại diện | phái đoàn | ví dụ điển hình | tiêu biểu | mang tính đại diện | lãnh đạo | số tổng đài | số chính",
        "representation | representative | delegate | delegation | exemplification | typification | being representative of | representative example | leader | switchboard number | main number",
        "1412170",
        "日本代表として出場します。","にほんだいひょうとしてしゅつじょうします。","Tôi thi đấu với tư cách đại diện Nhật Bản.","I compete as a representative of Japan."),
    row("仲間","なかま","N4","n",
        "bạn đồng hành | người bạn | bạn bè | đồng đội | đối tác | đồng nghiệp | nhóm | thành viên cùng danh mục",
        "companion | fellow | friend | mate | comrade | partner | colleague | coworker | associate | group | company | circle | member of the same category",
        "1425790",
        "仲間と協力します。","なかまときょうりょくします。","Tôi hợp tác với đồng đội.","I cooperate with my companions."),
    row("逃げる","にげる","N4","v1|vi",
        "bỏ chạy | chạy trốn | thoát ra (ví dụ khỏi nguy hiểm) | trốn thoát | rời bỏ (ví dụ vợ/chồng) | trú ẩn | tránh né (câu hỏi, trách nhiệm) | lảng tránh | né tránh | lùi lại | giữ vị trí dẫn đầu (và chiến thắng)",
        "to run away | to flee | to get away (e.g. from danger) | to escape | to break out | to leave (e.g. one's spouse) | to take cover | to avoid (a question, responsibility, etc.) | to evade | to dodge | to shirk | to back away | to keep the lead (and win)",
        "1450330",
        "危険から逃げます。","きけんからにげます。","Tôi thoát khỏi nguy hiểm.","I escape from danger."),
    row("下ろす","おろす","N4","v5s|vt",
        "hạ xuống | đưa xuống | hạ (tay, cờ, cửa chớp) | thả (neo, rèm) | xõa (tóc) | hạ thủy (thuyền) | cho hành khách xuống | dỡ hàng | rút (tiền) | dùng lần đầu tiên | phi lê (cá) | nạo (ví dụ củ cải) | tỉa (cành) | bãi miễn (ai đó khỏi vị trí) | dọn (bàn) | truyền lại (ví dụ quần áo cũ)",
        "to take down | to bring down | to lower (a hand, flag, shutter, etc.) | to drop (an anchor, curtain, etc.) | to let down (hair) | to launch (a boat) | to drop off (a passenger) | to unload (goods) | to withdraw (money) | to use for the first time | to fillet (fish) | to grate (e.g. radish) | to prune (branches) | to remove (someone from a position) | to clear (the table) | to pass down (e.g. old clothes)",
        "1589580",
        "お金を下ろします。","おかねをおろします。","Tôi rút tiền.","I withdraw money."),
    row("トラブル","トラブル","N4","n",
        "rắc rối | khó khăn | vấn đề | cãi vã | xung đột | tranh chấp | hỏng hóc (động cơ, máy móc, máy tính) | trục trặc | tình trạng (y tế) | rối loạn",
        "trouble | difficulty | problem | quarrel | conflict | dispute | fight | failure (of an engine, machine, computer, etc.) | breakdown | malfunction | (medical) condition | disorder",
        "1085920",
        "トラブルが起きました。","トラブルがおきました。","Rắc rối đã xảy ra.","A problem occurred."),
    row("光","ひかり","N4","n",
        "ánh sáng | chiếu sáng | tia sáng | chùm sáng | ánh lấp lánh | hạnh phúc | hy vọng | ảnh hưởng | sức mạnh | tầm nhìn | thị lực | cáp quang",
        "light | illumination | ray | beam | gleam | glow | happiness | hope | influence | power | vision | eyesight | optical fiber",
        "1272780",
        "光がまぶしいです。","ひかりがまぶしいです。","Ánh sáng chói.","The light is dazzling."),
    row("止める","とめる","N4","v1|vt",
        "dừng lại | tắt | đỗ xe | ngăn chặn | trấn áp (ho) | kìm nén (nước mắt) | nín thở | giảm (đau) | thuyết phục không làm | cấm | ngăn cấm | chú ý | nhận ra | ghi nhớ | cố định (tại chỗ) | buộc chặt | ghim | đóng đinh | giam giữ",
        "to stop | to turn off | to park | to prevent | to suppress (a cough) | to hold back (tears) | to hold (one's breath) | to relieve (pain) | to dissuade | to forbid | to prohibit | to notice | to be aware of | to remember | to fix (in place) | to fasten | to pin | to nail | to detain",
        "1310670",
        "車を止めます。","くるまをとめます。","Tôi đỗ xe.","I park the car."),
    row("舞台","ぶたい","N4","n",
        "sân khấu (nhà hát, phòng hòa nhạc) | màn trình diễn trên sân khấu | vở kịch | buổi biểu diễn | bối cảnh (của câu chuyện) | lĩnh vực (hoạt động) | đấu trường | thế giới",
        "stage (of a theatre, concert hall, etc.) | stage performance | theatrical production | play | show | setting (of a story) | sphere (of activity) | arena | world",
        "1499150",
        "舞台に立ちます。","ぶたいにたちます。","Tôi đứng trên sân khấu.","I stand on stage."),
    row("変化","へんか","N4","n|vs|vi",
        "thay đổi | biến thể | thay đổi | đột biến | chuyển tiếp | biến đổi | sự đa dạng | biến cách | biến tố | chia động từ | bước né tránh (tại đầu trận đấu sumo)",
        "change | variation | alteration | mutation | transition | transformation | variety | diversity | inflection | declension | conjugation | evasive sidestep at the beginning of a bout",
        "1510890",
        "気候が変化します。","きこうがへんかします。","Khí hậu biến đổi.","The climate is changing."),
    row("注ぐ","そそぐ","N4","v5g|vt|vi",
        "rót vào | rắc lên (từ trên cao) | tưới (ví dụ cây cối) | đổ lên | phun | rơi (nước mắt) | tập trung năng lượng (sức mạnh, sự chú ý) vào | cống hiến cho | nhìn chằm chằm vào | chảy vào (ví dụ sông) | rơi xuống (mưa, tuyết)",
        "to pour (into) | to sprinkle on (from above) | to water (e.g. plants) | to pour onto | to spray | to shed (tears) | to concentrate one's energy on | to devote to | to fix (one's eyes) on | to flow into (e.g. of a river) | to fall (of rain, snow) | to pour down",
        "1581730",
        "水を注ぎます。","みずをそそぎます。","Tôi rót nước.","I pour water."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
