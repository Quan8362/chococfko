# -*- coding: utf-8 -*-
"""Build N2 ready wave 017 — commerce, retail, logistics, business finance."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-017.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("商標","しょうひょう","n","nhãn hiệu | thương hiệu","trademark","1347290"),
    ("出荷","しゅっか","n|vs|vt","xuất hàng | giao hàng | vận chuyển đi","shipping | shipment | forwarding","1338350"),
    ("入荷","にゅうか","n|vs|vt|vi","nhập hàng | hàng về","arrival of goods | goods received","1465780"),
    ("物流","ぶつりゅう","n","logistics | lưu thông hàng hóa | phân phối","physical distribution | logistics","1629510"),
    ("商社","しょうしゃ","n","công ty thương mại | hãng buôn","trading company","1347080"),
    ("問屋","とんや","n","cửa hàng bán buôn | đại lý bán sỉ","wholesale store | wholesaler","1584790"),
    ("需給","じゅきゅう","n","cung và cầu | cung cầu","supply and demand","1330430"),
    ("単価","たんか","n|adj-no","đơn giá | giá đơn vị","unit price | unit cost","1417190"),
    ("原価","げんか","n","giá gốc | giá vốn | giá thành","cost price","1592820"),
    ("時価","じか","n|adj-no","giá thị trường | giá hiện hành","current value | market value","1315910"),
    ("廉価","れんか","n|adj-na","giá rẻ | giá phải chăng","low price | moderate price","1558650"),
    ("暴騰","ぼうとう","n|vs|vi","tăng vọt | tăng đột biến | nhảy vọt (giá)","sudden rise | sharp rise | skyrocketing","1519510"),
    ("急落","きゅうらく","n|vs|vi","tụt dốc | giảm mạnh | rớt giá nhanh","sudden fall | sharp drop","1229000"),
    ("値下げ","ねさげ","n|vs|vt","giảm giá | hạ giá","price reduction | price cut | markdown","1600100"),
    ("安売り","やすうり","n|vs|vt","bán rẻ | bán hạ giá | cho đi dễ dãi","bargain sale | selling cheaply","1154220"),
    ("販促","はんそく","n","xúc tiến bán hàng | khuyến mãi","sales promotion","1648750"),
    ("誇大","こだい","adj-na|n","phóng đại | cường điệu | thổi phồng","exaggeration | hyperbole","1267790"),
    ("看板","かんばん","n","biển hiệu | bảng quảng cáo | bộ mặt | giờ đóng cửa","signboard | billboard | feature | closing time","1213990"),
    ("分店","ぶんてん","n","chi nhánh | cửa hàng nhánh","branch store | branch of a firm","1504010"),
    ("出店","しゅってん","n|vs|vt|vi","mở cửa hàng | dựng gian hàng | mở quầy","opening a new store | setting up a stall","2404300"),
    ("閉店","へいてん","n|vs|vt|vi","đóng cửa (hết giờ) | đóng cửa tiệm | dẹp tiệm","closing up shop | going out of business","1508720"),
    ("陳列","ちんれつ","n|vs|vt","trưng bày | bày bán | trình bày hàng hóa","exhibition | display","1432210"),
    ("試供品","しきょうひん","n","hàng mẫu | quà tặng khuyến mãi","(free) sample | promotional gift","1312310"),
    ("試食","ししょく","n|vs|vt","ăn thử | nếm thử | dùng thử","sampling food | tasting","1312490"),
    ("検品","けんぴん","n|vs|vt","kiểm hàng | kiểm tra sản phẩm","inspection | checking (goods)","1814610"),
    ("出庫","しゅっこ","n|vs","xuất kho | xuất xưởng | ra khỏi gara","delivery from a storehouse | leaving a garage","1338830"),
    ("入庫","にゅうこ","n|vs|vt|vi","nhập kho | đưa vào gara | vào kho","warehousing | storing | entering a garage","1466050"),
    ("梱包","こんぽう","n|vs|vt","đóng gói | đóng kiện | bao gói","packing | crating | packaging","1290300"),
    ("荷造り","にづくり","n|vs|vi","đóng gói hành lý | gói ghém | bó kiện","packing | baling | crating","1195270"),
    ("集荷","しゅうか","n|vs|vt|vi","thu gom hàng | nhận hàng (gửi)","collection of cargo | cargo booking","1333590"),
    ("通販","つうはん","n|vs|vt","mua bán qua mạng | đặt hàng từ xa | bán hàng đặt mua","online shopping | mail order","1984130"),
    ("月賦","げっぷ","n","trả góp hàng tháng | trả theo tháng","monthly installment | monthly payment","1255800"),
    ("手付金","てつけきん","n","tiền đặt cọc | tiền cọc","deposit | earnest money","1698490"),
    ("保証金","ほしょうきん","n","tiền đặt cọc (thuê nhà) | tiền bảo lãnh | tiền bảo đảm","deposit | security money | guarantee","1513810"),
    ("賃料","ちんりょう","n","tiền thuê | giá thuê","rent | rental","2012390"),
    ("諸経費","しょけいひ","n","các chi phí phát sinh | chi phí linh tinh","sundry expenses","1952480"),
    ("固定費","こていひ","n","chi phí cố định | định phí","fixed cost | fixed expense","1631040"),
    ("変動費","へんどうひ","n","chi phí biến đổi | biến phí","variable cost","2219480"),
    ("人件費","じんけんひ","n","chi phí nhân công | chi phí nhân sự","personnel expenses | labor cost","1367180"),
    ("仕入れ値","しいれね","n","giá nhập | giá mua vào","cost price | buying price","1879910"),
    ("利益率","りえきりつ","n","tỷ suất lợi nhuận","profit ratio","1758350"),
    ("帳尻","ちょうじり","n","số dư cân đối | sự khớp sổ sách | tính nhất quán","balance of accounts | consistency","1623010"),
    ("資金繰り","しきんぐり","n","xoay vốn | huy động vốn | dòng tiền","fundraising | financing | cash flow","1312710"),
    ("廃業","はいぎょう","n|vs|vt|vi","ngừng kinh doanh | đóng cửa | bỏ nghề","discontinuation of business | giving up one's practice","1472060"),
    ("起業","きぎょう","n|vs|vi","khởi nghiệp | lập nghiệp","starting a business","1223750"),
    ("創業","そうぎょう","n|vs|vt|vi","sáng lập (doanh nghiệp) | thành lập | khai nghiệp","establishment (of a business) | founding","1398340"),
    ("買収","ばいしゅう","n|vs|vt","thâu tóm | mua lại (công ty) | mua chuộc | hối lộ","acquisition | takeover | bribery","1473780"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
