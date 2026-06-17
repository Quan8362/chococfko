# -*- coding: utf-8 -*-
"""Build N1 ready wave 066 — literary kana adjectives/adverbs (set 66)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-066.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("いじましい","いじましい","adj-i","nhỏ nhen | bủn xỉn | tội nghiệp | đáng thương | dễ thương đáng yêu","stingy | petty | pathetic | touching","1000790"),
    ("おどろおどろしい","おどろおどろしい","adj-i","rùng rợn | ghê rợn | dựng tóc gáy | màu mè phô trương","eerie | hair-raising | ostentatious","2167560"),
    ("きまり悪い","きまりわるい","adj-i","ngượng ngùng | bối rối | xấu hổ | mắc cỡ | ngại ngùng","embarrassed | ashamed","1254160"),
    ("けたたましい","けたたましい","adj-i","chói tai | inh ỏi | the thé | om sòm | ầm ĩ","piercing | shrill | noisy | clamorous","1004180"),
    ("さもしい","さもしい","adj-i","đê tiện | hèn hạ | bần tiện | ích kỷ tham lam | thấp hèn","low | vulgar | base | ignoble | selfish","1005280"),
    ("しおらしい","しおらしい","adj-i","dịu dàng | nhu mì | khiêm nhường | dễ thương | đáng khen","meek | gentle | modest | charming | admirable","2056900"),
    ("しがない","しがない","adj-i","tầm thường | hèn mọn | vô danh tiểu tốt | nghèo hèn | nhỏ nhoi","worthless | insignificant | poor | humble","2008310"),
    ("すばしっこい","すばしっこい","adj-i","nhanh nhẹn | lanh lẹ | tháo vát | nhanh trí | lém lỉnh","quick | nimble | agile | quick-witted","1006180"),
    ("せせこましい","せせこましい","adj-i","chật chội | tù túng | hẹp hòi | nhỏ nhặt | tủn mủn","narrow | cramped | fussy | narrow-minded","2079400"),
    ("つれない","つれない","adj-i","lạnh nhạt | hờ hững | thờ ơ | vô tình | lãnh đạm","cold | indifferent | unfriendly | unkind","2058300"),
    ("でかい","でかい","adj-i","to | bự | khổng lồ | đồ sộ | bự chảng","huge | big | enormous","1008370"),
    ("なよやか","なよやか","adj-na","mềm mại | yểu điệu | thướt tha | mảnh mai | uyển chuyển","supple | pliant | slender | delicate","2733210"),
    ("むくつけき","むくつけき","adj-pn","thô kệch | cục mịch | quê mùa thô lỗ | thô thiển","coarse | uncultured","2272500"),
    ("慎ましやか","つつましやか","adj-na","khiêm tốn | nhún nhường | kín đáo | e ấp | dè dặt","modest | reserved","2201680"),
    ("雅やか","みやびやか","adj-na|n","thanh nhã | tao nhã | trang nhã | quý phái | lịch lãm","elegant | graceful","1197840"),
    ("のっそり","のっそり","adv|adv-to|vs","chậm chạp | lề mề | ì ạch | nặng nề | đờ đẫn","sluggishly | ploddingly | lumbering","2454380"),
    ("むっつり","むっつり","adv-to|adv|vs|n","lầm lì | ít nói | cộc cằn | mặt mày khó đăm đăm | kẻ kiệm lời","sullenly | taciturn | a taciturn person","1012390"),
    ("ねっとり","ねっとり","adv|adv-to|vs","nhớp nháp | dính nhớp | quánh đặc | dẻo quẹo | sền sệt","viscously | stickily","2193540"),
    ("くだくだしい","くだくだしい","adj-i","dài dòng | rườm rà | lê thê | lằng nhằng | nhiêu khê","tedious | lengthy | long-winded","2075990"),
    ("そこはかとない","そこはかとない","adj-i","mơ hồ | thoang thoảng | mong manh | phảng phất | khó tả","faint | slight | vague | a tinge of...","2569830"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
