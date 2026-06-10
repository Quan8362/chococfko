# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-002.csv in UTF-8."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-002.csv"
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
    row("サービス","サービス","N4","n|vs|vi|vt",
        "dịch vụ | giúp đỡ | hỗ trợ | chăm sóc | quan tâm | giảm giá | hàng giảm giá | dịch vụ miễn phí | quà tặng | vật phẩm miễn phí | dịch vụ (trong trò chơi)",
        "service | help | assistance | care | concern | discount | discounted item | free service | present | complimentary item | service (e.g. an in-game item purchased or earned)",
        "1021980",
        "サービスがいいですね。","サービスがいいですね。","Dịch vụ tốt quá nhỉ.","The service is great."),
    row("チェック","チェック","N4","n|adj-no|vs|vt|vi",
        "kẻ ô vuông (hoa văn) | vải kẻ ô | kiểm tra | thanh tra | xem xét | soi xét | thanh toán hóa đơn | chiếu (trong cờ vua) | séc",
        "check (pattern) | plaid | check | inspection | examination | looking over | scrutiny | paying the bill | check (in chess) | cheque",
        "1023760",
        "チェックリストを確認します。","チェックリストをかくにんします。","Tôi kiểm tra danh sách.","I check the checklist."),
    row("噛む","かむ","N4","v5m|vt",
        "cắn | nhai | gặm | nhai kỹ | vấp váp lời nói (đặc biệt khi nói trước đám đông) | có liên quan đến",
        "to bite | to chew | to gnaw | to masticate | to fumble one's words (esp. during a speech) | to be involved in",
        "1210270",
        "よく噛んで食べます。","よくかんでたべます。","Tôi nhai kỹ rồi ăn.","I eat by chewing thoroughly."),
    row("焼く","やく","N4","v5k|vt",
        "đốt | nướng | nướng lò | nướng vỉ | nướng bánh | nướng bánh mì | nướng BBQ | rang | sém | nung | rám nắng | in (ảnh) | ghen tị | ganh tị",
        "to burn | to roast | to broil | to grill | to bake | to toast | to barbecue | to torrefy | to singe | to fire | to tan | to print (a photo) | to be jealous of | to be envious of",
        "1348080",
        "魚を焼きます。","さかなをやきます。","Tôi nướng cá.","I grill fish."),
    row("打つ","うつ","N4","v5t|vt",
        "đánh | đập | gõ | vỗ | đấm | tát | gõ nhẹ | đập mạnh | đóng búa | đánh bóng | đóng đinh | gõ (bàn phím) | sét đánh | đọc thần chú | tiêm (thuốc) | chơi (trò chơi)",
        "to hit | to strike | to knock | to beat | to punch | to slap | to tap | to bang | to hammer | to bat | to drive in (a nail) | to type | to strike (lightning) | to cast (a spell) | to administer (medicine) | to play (a game)",
        "1155410",
        "ボールを打ちます。","ボールをうちます。","Tôi đánh bóng.","I hit the ball."),
    row("返す","かえす","N4","v5s|vt|aux-v",
        "trả lại (đồ vật) | khôi phục | cất lại chỗ cũ | lật qua | lật ngược | lật đổ | hoàn trả | trả thù | lặp lại",
        "to return (something) | to restore | to put back | to turn over | to turn upside down | to overturn | to pay back | to retaliate | to repeat",
        "1207870",
        "本を返します。","ほんをかえします。","Tôi trả lại cuốn sách.","I return the book."),
    row("豊か","ゆたか","N4","adj-na|suf",
        "dồi dào | phong phú | giàu có | đầy đủ | sung túc | khá giả | thịnh vượng | xa hoa | xanh tươi | đủ đầy",
        "abundant | plentiful | rich | ample | rich | wealthy | affluent | well-off | opulent | lush | well-provided | plentiful",
        "1280680",
        "自然が豊かです。","しぜんがゆたかです。","Thiên nhiên phong phú.","Nature is abundant."),
    row("揺れる","ゆれる","N4","v1|vi",
        "rung | lắc | chao đảo | đung đưa | run | giật mạnh | nghiêng (tàu thuyền) | lăn | do dự | bị lung lay | lưỡng lự",
        "to shake | to sway | to rock | to swing | to tremble | to jolt | to pitch | to roll | to waver | to be swayed | to hesitate",
        "1281990",
        "地震で揺れました。","じしんでゆれました。","Bị rung do động đất.","It shook due to the earthquake."),
    row("流す","ながす","N4","v5s|vt|vi|suf",
        "rút (nước) | đổ | để chảy | xả | chảy máu | rơi nước mắt | rửa trôi | lưu thông | phát sóng | stream | bỏ qua | phủ nhận | lờ đi",
        "to drain | to pour | to run | to let flow | to flush | to shed (blood, tears) | to wash away | to circulate | to broadcast | to stream | to let go | to dismiss | to ignore",
        "1316140",
        "水を流します。","みずをながします。","Tôi xả nước.","I drain the water."),
    row("流れる","ながれる","N4","v1|vi",
        "chảy | dòng chảy (chất lỏng, thời gian) | chảy mực | bị cuốn trôi | trôi dạt | lưu thông | được phát sóng | stream | trôi qua (thời gian) | trôi đi | bỏ lỡ cơ hội",
        "to stream | to flow (liquid, time, etc.) | to run (ink) | to be washed away | to drift | to circulate | to be broadcast | to stream | to pass (time) | to elapse | to slip (notice, opportunity)",
        "1316150",
        "川が流れています。","かわがながれています。","Dòng sông đang chảy.","The river is flowing."),
    row("回る","まわる","N4","v5r|vi|suf",
        "quay | xoay | quay vòng | quay tròn | đi vòng quanh | vòng tròn | quay quanh | đi vòng quanh thế giới | di chuyển | đi tuần | đi qua | ghé thăm nhiều nơi | lan ra | lưu thông | ngấm (rượu) | được truyền tay",
        "to turn | to rotate | to revolve | to spin | to go around | to circle | to revolve around | to circumnavigate | to move around | to make a round | to go by way of | to visit several places | to spread | to circulate | to influence (of alcohol) | to be passed around",
        "1533730",
        "地球が太陽の周りを回ります。","ちきゅうがたいようのまわりをまわります。","Trái đất quay quanh mặt trời.","The Earth revolves around the Sun."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
