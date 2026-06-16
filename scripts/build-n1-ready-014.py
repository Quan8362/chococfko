# -*- coding: utf-8 -*-
"""Build N1 ready wave 014 — government/finance/legal terms (set 14)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-014.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("治世","ちせい","n","trị vì | triều đại | thời thái bình | thời trị","rule | reign | peaceful times","1622860"),
    ("善政","ぜんせい","n","chính sự tốt | cai trị hiền minh | đức chính","good government","1394470"),
    ("悪政","あくせい","n","chính trị tồi tệ | bạo chính | cai trị yếu kém","misgovernment | misrule | bad government","1152110"),
    ("失政","しっせい","n","sai lầm chính trị | thất bại trong cai trị | thất chính","misgovernment","1320030"),
    ("内政","ないせい","n|adj-no","nội chính | việc nội bộ quốc gia | hành chính trong nước","domestic affairs | internal administration","1458600"),
    ("外政","がいせい","n","ngoại giao | chính sách đối ngoại | việc đối ngoại","foreign policy | diplomatic affairs","2799250"),
    ("国政","こくせい","n|adj-no","quốc chính | chính trị quốc gia | việc nước","national politics | statecraft","1286740"),
    ("市政","しせい","n|adj-no","chính quyền thành phố | hành chính đô thị | thị chính","municipal government","1308540"),
    ("県政","けんせい","n","chính quyền tỉnh | hành chính cấp tỉnh","prefectural government","2395130"),
    ("租税","そぜい","n","thuế | thuế khóa | sưu thuế","taxes | taxation","1396900"),
    ("減税","げんぜい","n|vs|vt|vi","giảm thuế | cắt giảm thuế","tax reduction","1263260"),
    ("歳費","さいひ","n","chi tiêu hàng năm | lương năm (nghị sĩ) | niên phí","annual expenditure | annual salary (Diet members)","1294990"),
    ("公債","こうさい","n","công trái | trái phiếu chính phủ | nợ công","public debt | government bond","1273700"),
    ("傘下","さんか","n","trực thuộc | dưới quyền | thuộc tập đoàn | dưới trướng","affiliated with | under the umbrella of","1301960"),
    ("入札","にゅうさつ","n|vs|vi","đấu thầu | bỏ thầu | dự thầu","bid | tender | bidding","1466180"),
    ("落札","らくさつ","n|vs|vt","trúng thầu | thắng thầu | đấu giá thành công","successful bid | winning a tender","1548750"),
    ("下請け","したうけ","n|vs","thầu phụ | nhà thầu phụ | gia công lại","subcontract | subcontractor","1594320"),
    ("受託","じゅたく","n|vs|vt","được ủy thác | nhận ủy thác | đảm nhận","being entrusted with | taking charge of","1329930"),
    ("債務不履行","さいむふりこう","n","vỡ nợ | không trả được nợ | mất khả năng thanh toán","default on a debt","1777470"),
    ("免責","めんせき","n|vs|vt","miễn trách nhiệm | miễn trừ | giải trừ nghĩa vụ","exemption from responsibility","1533260"),
    ("質権","しちけん","n","quyền cầm cố | quyền thế chấp","right of pledge","1706540"),
    ("公売","こうばい","n|vs|vt","bán đấu giá công khai | phát mại công","public sale | public auction","1274500"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
