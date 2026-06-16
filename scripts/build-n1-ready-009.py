# -*- coding: utf-8 -*-
"""Build N1 ready wave 009 — philosophy/economics/law academic terms (set 9)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-009.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("通念","つうねん","n","quan niệm chung | nhận thức phổ biến | lẽ thường","common idea | common wisdom | generally accepted idea","1433500"),
    ("邪念","じゃねん","n","tà niệm | ý nghĩ xấu xa | tâm địa đen tối","wicked thought | wicked mind","1634850"),
    ("雑念","ざつねん","n","tạp niệm | suy nghĩ vẩn vơ | ý nghĩ phiền nhiễu","idle thoughts | worldly thoughts","1299490"),
    ("妄念","もうねん","n","vọng niệm | ý nghĩ sai lầm cố chấp | tà tâm","conviction based on flawed ideas | obstructive thought","1533790"),
    ("懸案","けんあん","n|adj-no","vấn đề tồn đọng | việc còn treo | bài toán chưa giải","pending question | unresolved problem","1257660"),
    ("省察","せいさつ","n|vs|vt","tự xét | suy ngẫm | phản tỉnh | chiêm nghiệm","reflection | consideration","1351080"),
    ("悟性","ごせい","n","trí tuệ | giác tính | khả năng lĩnh hội","wisdom | understanding","1270860"),
    ("情操","じょうそう","n","tình cảm thẩm mỹ | tâm hồn (nghệ thuật, đạo đức) | tình cảm cao đẹp","sensibility (artistic, moral) | sentiment","1635610"),
    ("詩情","しじょう","n","thi hứng | chất thơ | cảm hứng thơ ca","poetic sentiment | poetic inspiration","1312210"),
    ("叙情","じょじょう","n|adj-no","trữ tình | biểu lộ cảm xúc | tính trữ tình","lyricism | description of one's feelings","1595470"),
    ("形而上","けいじじょう","adj-no|n","siêu hình | hình nhi thượng | trừu tượng","metaphysical","1250290"),
    ("形而下","けいじか","adj-no|n","hữu hình | vật chất | hình nhi hạ","physical | material","1250280"),
    ("弁証法","べんしょうほう","n","phép biện chứng | biện chứng pháp","dialectic | dialectics","1513020"),
    ("命題","めいだい","n|adj-no","mệnh đề | luận đề | vấn đề | bài toán đặt ra","proposition | thesis | issue | challenge","1532070"),
    ("定説","ていせつ","n","học thuyết được công nhận | định luận | quan điểm chính thống","established theory | accepted opinion","1435700"),
    ("逆説","ぎゃくせつ","n","nghịch lý | nghịch biện | điều trái khoáy","paradox","1227140"),
    ("通説","つうせつ","n","thuyết phổ biến | quan điểm chung | luận điểm được chấp nhận","prevailing view | commonly accepted theory","1433420"),
    ("論駁","ろんばく","n|vs|vt","bác bỏ | phản bác | luận bác","refutation | confutation","1738780"),
    ("立脚","りっきゃく","n|vs|vi","dựa trên | đứng trên lập trường | căn cứ vào","being based on","1551620"),
    ("実存","じつぞん","n|vs|adj-no|vi","sự tồn tại | hiện sinh | thực tồn","existence","1321330"),
    ("超越","ちょうえつ","n|vs|vi","siêu việt | vượt lên trên | vượt qua | siêu nghiệm","transcendence","1429360"),
    ("内在","ないざい","vs|vi|n","tiềm tàng bên trong | nội tại | vốn có | nội hàm","to be inherent | to be immanent | immanence","1458270"),
    ("顕在","けんざい","n|vs|vi","hiển hiện | bộc lộ rõ | hiện hữu rõ ràng | lộ rõ","being apparent | being obvious | being revealed","1260620"),
    ("止揚","しよう","n|vs|vt","sự dương khí (triết) | siêu vượt giữ lại | dương khí biện chứng","sublation","1770160"),
    ("端緒","たんしょ","n","manh mối | đầu mối | khởi đầu | bước đầu","start | beginning | first step | clue","1418890"),
    ("所与","しょよ","adj-no|n","cái cho sẵn | điều kiện tiền đề | dữ kiện","given (conditions) | data | given thing","1343440"),
    ("所為","しょい","n","hành vi | việc làm | nguyên do | duyên cớ","act | deed | cause | reason","1343140"),
    ("帰趨","きすう","n|vs|vi","kết cục | chiều hướng | xu thế | hệ quả","outcome | consequence | tendency | trend","1221400"),
    ("収斂","しゅうれん","n|vs|vt|vi","co lại | hội tụ | thu gọn | tổng hợp (ý kiến) | thu (thuế)","astringency | contraction | convergence | collecting","1331000"),
    ("逓減","ていげん","n|vs|vt|vi","giảm dần | giảm tiệm tiến | suy giảm từng bước","gradual decrease | gradual diminution","1436770"),
    ("逓増","ていぞう","n|vs|vt|vi","tăng dần | tăng tiệm tiến | tăng từng bước","gradual increase","1436800"),
    ("譲渡","じょうと","n|vs|vt","chuyển nhượng | nhượng lại | sang tên | chuyển giao","transfer | assignment | conveyance","1357040"),
    ("弁済","べんさい","n|vs|vt","thanh toán | trả nợ | hoàn trả | bồi hoàn","repayment | settlement of a debt | reimbursement","1512940"),
    ("減価","げんか","n|vs|vi","giảm giá | khấu hao | hạ giá trị","price reduction | depreciation","1263140"),
    ("騰貴","とうき","n|vs|vi","tăng giá | lên giá | tăng vọt (giá trị)","rise in price | appreciation | advance","1450970"),
    ("裁定","さいてい","n|vs|vt","phán quyết | quyết định trọng tài | phân xử","decision | ruling | arbitration","1579240"),
    ("和議","わぎ","n","hòa đàm | đàm phán hòa bình | thương lượng giảng hòa","peace conference | peace negotiations","1666700"),
    ("示談","じだん","n|vs|vi","hòa giải ngoài tòa | dàn xếp riêng | thỏa thuận tư","settlement out of court | private settlement","1317140"),
    ("赦免","しゃめん","n|vs|vt","ân xá | tha tội | đại xá | xá miễn","pardon | remission | amnesty","1322390"),
    ("免訴","めんそ","n|vs","miễn tố | bãi nại | đình chỉ vụ án","acquittal | dismissal of a case","1533300"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
