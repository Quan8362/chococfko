# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-038.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 13 persistent ghosts + 2863507 度々どど + 2861198 煙草えんそう + 2855863 貪欲とんよく(Buddhist)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("手帳","てちょう","N3","n",
        "sổ tay | nhật ký bỏ túi | chứng minh thư",
        "notebook | memo pad | (pocket) diary | certificate | identification card","1598330"),
    row("手作り","てづくり","N3","adj-no|n",
        "tự làm | thủ công | làm bằng tay",
        "handmade | handcrafted | homemade | homegrown","1598360"),
    row("照り焼き","てりやき","N3","n",
        "teriyaki | thịt hoặc cá ướp nước tương ngọt nướng",
        "teriyaki (meat or fish marinated in sweet soy sauce and broiled)","1598430"),
    row("出会う","であう","N3","v5u|vi",
        "tình cờ gặp | bắt gặp | gặp gỡ | tao ngộ",
        "to meet (by chance) | to come across | to run across | to encounter | to happen upon","1598530"),
    row("出かける","でかける","N3","v1|vi",
        "ra ngoài | đi ra | khởi hành | sắp đi",
        "to go out (e.g. on an excursion or outing) | to leave | to depart | to start | to set out","1598550"),
    row("尊い","とうとい","N3","adj-i",
        "quý giá | vô giá | cao quý | thiêng liêng",
        "precious | valuable | priceless | noble | exalted | sacred","1598620"),
    row("時折","ときおり","N3","adv",
        "thỉnh thoảng | đôi khi | không thường xuyên",
        "sometimes | at intervals | occasionally | on occasion | from time to time","1598670"),
    row("所々","ところどころ","N3","adv|n",
        "chỗ này chỗ kia | rải rác | đây đó",
        "here and there | in places","1598730"),
    row("取り消し","とりけし","N3","n",
        "hủy bỏ | rút lại | xóa bỏ",
        "cancellation | withdrawal | abolition | revocation | cancel","1599050"),
    row("取り分け","とりわけ","N3","adv|n",
        "đặc biệt | nhất là | trên hết",
        "especially | particularly | above all | portioning out (servings of food)","1599150"),
    row("動悸","どうき","N3","n",
        "tim đập mạnh | hồi hộp | đánh trống ngực",
        "palpitation (of the heart) | pounding | throbbing | thumping","1599210"),
    row("泥棒","どろぼう","N3","n|vs|vt",
        "tên trộm | ăn cắp | tên cướp | vụ trộm",
        "thief | burglar | robber | theft | burglary | robbery","1599340"),
    row("貪欲","どんよく","N3","adj-na|n",
        "tham lam | ham muốn | tham lợi",
        "greedy | avaricious | covetous","1599350"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
