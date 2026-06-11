# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-020.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

# EXCLUDED (persistent): 1708890 足取り, 2867035 家系, 2860958 既に,
# 2703560 大手おおで, 2752960 対面トイメン, 2845086 大分おおいた, 2657290 大柄おおへい,
# 2844618 断行だんぎょう, 2120840 男女おとこおんな, 2828178 地質じしつ
# EXCLUDED (new): 2834858 中流ちゅうる (banishment), 2772160 仲人なかびと (alt reading)

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("中盤","ちゅうばん","N3","n",
        "giai đoạn giữa | pha giữa | trung bàn",
        "middle stage | middle phase | middle game | midpoint | midfield (in soccer)","1425360"),
    row("中部","ちゅうぶ","N3","n",
        "trung tâm | khu vực trung bộ | vùng giữa",
        "center | centre | middle | heart | Chūbu region","1425390"),
    row("中背","ちゅうぜい","N3","n",
        "chiều cao trung bình",
        "average height","1425320"),
    row("中米","ちゅうべい","N3","n",
        "Trung Mỹ",
        "Central America","1425480"),
    row("中庸","ちゅうよう","N3","n|adj-no|adj-na",
        "con đường trung dung | mức vừa phải | trung dung",
        "middle way | (golden) mean | moderation | middle path | the Doctrine of the Mean","1425520"),
    row("中立","ちゅうりつ","N3","n",
        "trung lập",
        "neutrality","1425540"),
    row("中略","ちゅうりゃく","N3","n|vs|vt|vi",
        "lược bỏ đoạn giữa | bỏ qua phần giữa | dấu lược bỏ",
        "omission (of middle part of a text) | ellipsis","1425590"),
    row("中流","ちゅうりゅう","N3","n",
        "giữa dòng | giai cấp trung lưu | tầng lớp trung lưu",
        "mid-stream | middle course | middle class","1425600"),
    row("中和","ちゅうわ","N3","n|vs|vi|vt",
        "trung hòa | vô hiệu hóa",
        "neutralization | neutralisation | neutralization (e.g. of a poison) | counteraction","1425670"),
    row("仲違い","なかたがい","N3","n|vs|vi",
        "bất hòa | cãi nhau | rạn nứt quan hệ",
        "falling out (with) | quarrel | discord | estrangement | being on bad terms","1425730"),
    row("仲介","ちゅうかい","N3","n|vs|vt",
        "trung gian | môi giới | làm trung gian",
        "agency | intermediation","1425750"),
    row("仲間はずれ","なかまはずれ","N3","n|vs|vi",
        "bị bỏ rơi | bị loại khỏi nhóm | bị tẩy chay",
        "being left out | being ostracized","1425800"),
    row("仲間入り","なかまいり","N3","n|vs|vi",
        "gia nhập nhóm | trở thành thành viên | vào hàng",
        "joining (a group) | becoming a member (of) | joining the ranks (of)","1425840"),
    row("仲人","なこうど","N3","n",
        "người mai mối | người trung gian | người làm mối",
        "matchmaker | go-between | intermediary | middleman | mediator | intercessor","1425960"),
    row("仲立ち","なかだち","N3","n|vs|vi",
        "làm trung gian | hòa giải | môi giới",
        "mediation | agency | agent | mediator | middleman | go-between","1426070"),
    row("宙返り","ちゅうがえり","N3","n|vs|vi",
        "nhào lộn | lộn vòng",
        "somersault | looping-the-loop","1426110"),
    row("忠告","ちゅうこく","N3","n|vs|vt|vi",
        "lời khuyên | cảnh báo | khuyên bảo",
        "advice | warning","1426140"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
