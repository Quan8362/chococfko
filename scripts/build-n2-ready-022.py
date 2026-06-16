# -*- coding: utf-8 -*-
"""Build N2 ready wave 022 — abstract concepts, time, cause/foundation, harmony/discord."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-022.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("真意","しんい","n","ý định thật | dụng ý | ý nghĩa thực","real intention | true motive | true meaning","1363390"),
    ("着眼","ちゃくがん","n|vs|vi","để mắt tới | chú ý vào | nhìn ra (điểm) | quan sát","focusing on | paying attention to | observation","1616520"),
    ("近況","きんきょう","n","tình hình gần đây | tình trạng hiện thời","recent state | current circumstances","1242260"),
    ("現況","げんきょう","n","tình hình hiện tại | hiện trạng","present condition","1263530"),
    ("概況","がいきょう","n","tình hình chung | khái quát tình hình","outlook | general situation","1204440"),
    ("予兆","よちょう","n","điềm báo | dấu hiệu báo trước","omen | sign | indication","2087630"),
    ("症候","しょうこう","n","triệu chứng","symptom","1351010"),
    ("猶予","ゆうよ","n|vs|vt|vi","trì hoãn | gia hạn | hoãn lại","postponement | deferment | extension (of time)","1541740"),
    ("目下","もっか","n|adv","hiện nay | lúc này | hiện tại","at present | now","1535330"),
    ("昨今","さっこん","n|adv","dạo này | gần đây | thời gian gần đây","these days | nowadays | recently","1298210"),
    ("往年","おうねん","n|adj-no","những năm xưa | thời xưa | một thời","years gone by | former years | the past","1179750"),
    ("後年","こうねん","n|adv","những năm sau | về sau | hậu vận","future years | in one's later years","1270000"),
    ("終生","しゅうせい","n|adv","suốt đời | cả đời | trọn đời","all one's life | throughout one's life","1653450"),
    ("無限","むげん","n|adj-no|adj-na","vô hạn | vô tận | vĩnh hằng","infinity | eternity | limitless","1529880"),
    ("有限","ゆうげん","adj-no|adj-na|n","hữu hạn | có giới hạn","finite | limited","1541250"),
    ("刹那","せつな","n|adv","khoảnh khắc | sát na | tích tắc","moment | instant | shortest interval of time","1564500"),
    ("瞬時","しゅんじ","n|adj-no","tức thời | trong nháy mắt | chớp mắt","instant | moment | (in a) flash","1341240"),
    ("当座","とうざ","n|adj-no","tạm thời | trước mắt | hiện thời | tài khoản vãng lai","for the time being | immediate | checking account","1449050"),
    ("適時","てきじ","n|adj-na|adj-no","đúng lúc | kịp thời | hợp thời cơ","timely | opportune","1621420"),
    ("平時","へいじ","n|adj-no","thời bình | lúc bình thường | ngày thường","peacetime | ordinary times","1507350"),
    ("有事","ゆうじ","n","khi hữu sự | lúc khẩn cấp | tình huống biến cố","emergency","1745430"),
    ("非常時","ひじょうじ","n","thời khẩn cấp | lúc nguy cấp","time of emergency","1688740"),
    ("転機","てんき","n","bước ngoặt | thời điểm chuyển biến","turning point","1441090"),
    ("好機","こうき","n","cơ hội tốt | thời cơ | dịp may","good opportunity | chance","1277600"),
    ("時機","じき","n","thời cơ | dịp | lúc | thời điểm","opportunity | chance | occasion","1609870"),
    ("潮時","しおどき","n","con nước | đúng thời điểm | thời cơ thích hợp","tidal hour | right time | opportunity","1428670"),
    ("節目","ふしめ","n","bước ngoặt | mốc quan trọng | mắt gỗ","turning point | critical juncture | milestone","1722070"),
    ("区切り","くぎり","n","chỗ ngắt | dấu ngắt | đoạn dừng | cột mốc","pause (in speech) | break | milestone","1244180"),
    ("顛末","てんまつ","n","đầu đuôi sự việc | toàn bộ diễn biến | ngọn ngành","details (of an incident) | whole story | particulars","1441380"),
    ("行方","ゆくえ","n","tung tích | nơi đến | chiều hướng | tương lai","whereabouts | destination | outcome | future","1282180"),
    ("起因","きいん","vs|vi|n","do | bắt nguồn từ | xuất phát từ | nguyên nhân","to be caused by | to arise from | cause | origin","1223720"),
    ("誘因","ゆういん","n","tác nhân | nguyên nhân thúc đẩy | động lực","contributing cause | incentive | motive","1541920"),
    ("証左","しょうさ","n","bằng chứng | chứng cứ | nhân chứng","evidence | proof | witness","1654660"),
    ("拠り所","よりどころ","n","chỗ dựa | căn cứ | cơ sở | điểm tựa","grounds | foundation | support | something to rely on","1655700"),
    ("礎","いしずえ","n","nền móng | đá tảng | nền tảng","foundation stone | cornerstone","1396770"),
    ("基軸","きじく","n","trục cơ bản | nền tảng | cốt lõi | chuẩn mực","basis | foundation | core | standard","1614410"),
    ("支柱","しちゅう","n","cột chống | trụ đỡ | trụ cột | chỗ dựa","prop | stay | support | brace | fulcrum","1310220"),
    ("要","かなめ","n","then chốt | điểm mấu chốt | trọng yếu","pivot | vital point | keystone | cornerstone","1609600"),
    ("中枢","ちゅうすう","n","trung tâm | đầu não | nòng cốt | trung khu","centre | pivot | nucleus | central figure","1424660"),
    ("枢軸","すうじく","n","trục | trục xoay | trung tâm quyền lực | phe Trục","axle | pivot | central point | the Axis","1373360"),
    ("平衡","へいこう","n","cân bằng | thăng bằng | trạng thái cân bằng","balance | equilibrium","1507310"),
    ("和合","わごう","n|vs|vi","hòa hợp | hòa thuận | đồng lòng | hợp nhất","harmony | concord | unity | union","1638420"),
    ("融和","ゆうわ","n|vs|vi|adj-no","hòa hợp | hòa giải | dung hòa","harmony | reconciliation","1655630"),
    ("親和","しんわ","n|vs|vi","thân thiện | hòa thuận | thân ái","friendship | fellowship","1365430"),
    ("不和","ふわ","n","bất hòa | xích mích | lục đục | mâu thuẫn","discord | dissension | friction | conflict","1495460"),
    ("軋轢","あつれき","n","xích mích | bất hòa | va chạm | xung đột","friction | discord | strife","1573460"),
    ("確執","かくしつ","n|vs|vi","bất hòa | xung khắc | hiềm khích | đối kháng","discord | antagonism","1205820"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
