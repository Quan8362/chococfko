# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-033.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED: 12 persistent ghosts + 2855262 武士もののふ (archaic)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("寄付","きふ","N3","n|vs|vt",
        "đóng góp | quyên tặng | tặng phẩm",
        "contribution | donation","1591400"),
    row("凶悪","きょうあく","N3","adj-na|n",
        "tàn bạo | dã man | hung ác | vô cùng độc ác",
        "atrocious | heinous | fiendish | brutal | vicious","1591510"),
    row("凶器","きょうき","N3","n",
        "vũ khí nguy hiểm | vũ khí chết người | hung khí",
        "dangerous weapon | lethal weapon | deadly weapon | murder weapon","1591540"),
    row("強固","きょうこ","N3","adj-na",
        "vững chắc | kiên cố | bền vững | ổn định",
        "firm | strong | solid | stable","1591560"),
    row("協力","きょうりょく","N3","n|vs|vi",
        "hợp tác | cộng tác | giúp đỡ | hỗ trợ",
        "cooperation | collaboration | help | support","1591720"),
    row("切り替え","きりかえ","N3","n",
        "chuyển đổi | thay thế | đổi sang | chuyển sang",
        "exchange | conversion | replacement | switching (to) | switchover","1591760"),
    row("切り札","きりふだ","N3","n",
        "át chủ bài | lá bài tẩy | vũ khí bí mật",
        "trump | trump card | ace up one's sleeve | secret weapon","1591870"),
    row("極める","きわめる","N3","v1|vt",
        "đạt đến cực đoan | đến cùng tột | vươn đến giới hạn",
        "to carry to extremes | to go to the end of something | to reach the limits of something | to reach the peak","1591970"),
    row("疑似","ぎじ","N3","adj-f",
        "giả | tương tự | mô phỏng | nghi ngờ (bệnh, v.v.)",
        "pseudo | quasi | false | para- | mock | sham | suspected (case, e.g. of disease)","1592050"),
    row("偽装","ぎそう","N3","n|vs|vt",
        "ngụy trang | trá hình | giả dạng | đội lốt",
        "camouflage | disguise | pretense | feigning | masquerade","1592060"),
    row("区画","くかく","N3","n|vs|vt",
        "khu phân chia | lô | ô | khu vực | ranh giới",
        "division | section | compartment | block | plot | lot | partition | boundary","1592110"),
    row("屈服","くっぷく","N3","n|vs|vi",
        "đầu hàng | khuất phục | chịu thua | phục tùng",
        "yielding | submission | surrender | giving way | succumbing","1592240"),
    row("組み合わせ","くみあわせ","N3","n",
        "kết hợp | bộ sưu tập | tập hợp | ghép đôi",
        "combination | assortment | set | matching (in a contest) | pairing","1592290"),
    row("組み立て","くみたて","N3","n",
        "lắp ráp | xây dựng | cấu trúc | tổ chức",
        "construction | framework | erection | assembly | organization | organisation","1592310"),
    row("群衆","ぐんしゅう","N3","n",
        "đám đông | quần chúng | bầy đàn | đám người",
        "group (of people) | crowd | horde | throng | mob | multitude","1592510"),
    row("決着","けっちゃく","N3","n|vs|vi",
        "kết thúc | quyết định | giải quyết | kết luận",
        "conclusion | decision | end | settlement","1592630"),
    row("堅実","けんじつ","N3","adj-na",
        "vững chắc | đáng tin cậy | ổn định | an toàn",
        "steady | sound | stable | safe (e.g. business) | reliable | trustworthy | solid","1592720"),
    row("元素","げんそ","N3","n",
        "nguyên tố | nguyên tố hóa học | yếu tố",
        "element | chemical element | (classical) element (e.g. earth, water, air, fire)","1592840"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
