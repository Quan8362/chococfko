# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-026.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED (persistent 12): 1708890 足取り, 2867035 家系, 2860958 既に,
# 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい,
# 2844618 断行だんぎょう, 2120840 男女おとこおんな, 2828178 地質じしつ,
# 2834858 中流ちゅうる, 2772160 仲人なかびと

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("助言","じょげん","N3","n|vs|vt|vi",
        "lời khuyên | lời tư vấn | gợi ý",
        "advice | counsel | suggestion | tip | hint","1580230"),
    row("消耗","しょうもう","N3","n|vs|vt|vi",
        "kiệt sức | tiêu hao | tiêu thụ | hao mòn | lãng phí",
        "exhaustion | consumption | using up | dissipation | waste","1580310"),
    row("上院","じょういん","N3","n",
        "thượng viện | viện trên",
        "upper house | upper legislative chamber | senate","1580350"),
    row("情緒","じょうちょ","N3","n|adj-no",
        "cảm xúc | cảm giác | bầu không khí | tâm trạng",
        "emotion | feeling | atmosphere | mood | spirit","1580510"),
    row("先行き","さきゆき","N3","n",
        "tương lai | triển vọng | viễn cảnh",
        "the future | future prospects","1580990"),
    row("早急","そうきゅう","N3","adj-na|adj-no|n",
        "cấp bách | khẩn cấp | tức thì | nhanh chóng",
        "immediate | prompt | quick | rapid | urgent | pressing","1581270"),
    row("相反する","あいはんする","N3","vs-i|vi",
        "mâu thuẫn | đối lập | trái ngược | không nhất quán",
        "to be contrary | to run counter (to) | to conflict (with) | to disagree (with)","1581295"),
    row("全治","ぜんち","N3","n|vs|vi",
        "hồi phục hoàn toàn | chữa khỏi hẳn",
        "complete recovery | healing","1581190"),
    row("代替","だいたい","N3","n|vs|vt|adj-no",
        "thay thế | phương án thay thế | bổ sung",
        "substitution | alternative | substitute","1581470"),
    row("中指","なかゆび","N3","n",
        "ngón giữa",
        "middle finger | long finger | second finger | tall finger","1581690"),
    row("弔う","とむらう","N3","v5u|vt",
        "để tang | tưởng niệm | chia buồn | tổ chức tang lễ",
        "to mourn for | to grieve for | to condole with | to hold a memorial service for","1581760"),
    row("直球","ちょっきゅう","N3","n|adj-no",
        "bóng thẳng | thẳng thắn | thẳng thừng",
        "straight ball (pitch) | direct (e.g. question) | blunt","1581800"),
    row("弟子","でし","N3","n|adj-no",
        "học trò | đệ tử | môn đồ | người học việc",
        "pupil | disciple | adherent | follower | apprentice","1581960"),
    row("同胞","どうほう","N3","n",
        "đồng bào | anh em | đồng chí | người cùng quê hương",
        "brethren | brothers | fellow countrymen | fellowman | compatriot","1582360"),
    row("内幕","うちまく","N3","n",
        "nội tình | bí mật nội bộ | chi tiết ẩn | thực chất bên trong",
        "lowdown | inside information | hidden circumstances | inside facts | inner workings","1582570"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
