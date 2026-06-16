# -*- coding: utf-8 -*-
"""Build N2 ready wave 050 — banking, securities, insurance, welfare, tax deductions."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-050.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("預け入れ","あずけいれ","n|vs","gửi tiền (vào tài khoản) | tiền gửi","deposit","2531100"),
    ("複利","ふくり","n","lãi kép","compound interest","1501470"),
    ("単利","たんり","n","lãi đơn","simple interest","1418030"),
    ("約束手形","やくそくてがた","n","hối phiếu nhận nợ | kỳ phiếu","promissory note","1836550"),
    ("裏書","うらがき","n|vs|vt","ký hậu (séc, hối phiếu) | chứng thực mặt sau | xác nhận","endorsement | verification | confirmation","1588440"),
    ("振り出し","ふりだし","n","điểm xuất phát | khởi đầu | phát hành (hối phiếu) | gieo (xúc xắc)","starting point | drawing (of a bill) | throw (of dice)","1602990"),
    ("配当金","はいとうきん","n","tiền cổ tức","dividend","1689600"),
    ("株価","かぶか","n","giá cổ phiếu","stock prices","1208950"),
    ("時価総額","じかそうがく","n","vốn hóa thị trường","market capitalization | market cap","1994490"),
    ("出資金","しゅっしきん","n","vốn góp | vốn đầu tư","capital","1339100"),
    ("増資","ぞうし","n|vs|vt|vi","tăng vốn | phát hành thêm cổ phần","increase of capital | issue of new shares","1403230"),
    ("減資","げんし","n|vs|vi","giảm vốn","reduction of capital","1263190"),
    ("公募","こうぼ","n|vs|vt","kêu gọi công khai | tuyển công khai | chào bán công khai","public appeal | open recruitment | public offering","1274680"),
    ("上場","じょうじょう","n|vs|vt","niêm yết (chứng khoán) | đưa công ty lên sàn | trình diễn","listing (on stock exchange) | staging","1353500"),
    ("証券取引所","しょうけんとりひきじょ","n","sở giao dịch chứng khoán","securities exchange | stock exchange","1351630"),
    ("自己資本","じこしほん","n","vốn chủ sở hữu | vốn tự có","net worth | owned capital","1658550"),
    ("他人資本","たにんしほん","n","vốn vay | vốn đi vay | nợ vốn","borrowed capital | debt capital","2850180"),
    ("財テク","ざいテク","n","kỹ thuật quản lý tài chính | đầu tư sinh lời","money management technique | zaitech","2140100"),
    ("連帯保証","れんたいほしょう","n","bảo lãnh liên đới","joint liability on guarantee","1781880"),
    ("信用度","しんようど","n","mức độ tín nhiệm | độ tin cậy","level of confidence","2011490"),
    ("格付け","かくづけ","n|vs|vt","xếp hạng | đánh giá hạng | phân loại","rating | ranking | grading","1205480"),
    ("借入","しゃくにゅう","n|vs","khoản vay | việc vay mượn","loan | borrowing","2078920"),
    ("負担","ふたん","n|vs|vt","gánh nặng | gánh vác | chịu (chi phí, trách nhiệm)","burden | load | bearing (a cost)","1498130"),
    ("焦げ付き","こげつき","n","nợ khó đòi | nợ xấu","a bad debt","1733790"),
    ("不良債権","ふりょうさいけん","n","nợ xấu | khoản nợ khó đòi","bad debt | nonperforming loan","1946050"),
    ("競売","きょうばい","n|vs|vt","bán đấu giá","auction","1234220"),
    ("生命保険","せいめいほけん","n","bảo hiểm nhân thọ","life insurance","1379550"),
    ("損害保険","そんがいほけん","n","bảo hiểm phi nhân thọ | bảo hiểm tài sản và thiệt hại","non-life insurance | property and casualty insurance","1406740"),
    ("火災保険","かさいほけん","n","bảo hiểm cháy nổ | bảo hiểm hỏa hoạn","fire insurance","1193890"),
    ("自動車保険","じどうしゃほけん","n","bảo hiểm ô tô","automobile insurance","1726460"),
    ("医療保険","いりょうほけん","n","bảo hiểm y tế","medical-care insurance","1160250"),
    ("保険料","ほけんりょう","n","phí bảo hiểm","insurance premium","1513510"),
    ("保険金","ほけんきん","n","tiền bảo hiểm | tiền chi trả bảo hiểm","insurance payout | insurance money","1513470"),
    ("掛け金","かけきん","n","tiền đóng góp định kỳ | phí (bảo hiểm) | tiền góp","installment | premium","1590060"),
    ("共済","きょうさい","n","tương trợ | quỹ tương hỗ","mutual aid","1234410"),
    ("扶助","ふじょ","n|vs|vt","trợ giúp | hỗ trợ | giúp đỡ","aid | help | assistance | support","1496980"),
    ("生活保護","せいかつほご","n","trợ cấp sinh hoạt | bảo trợ xã hội | phúc lợi","livelihood protection | public assistance | welfare","1830110"),
    ("補助金","ほじょきん","n","tiền trợ cấp | khoản hỗ trợ","subsidy | grant","1514630"),
    ("助成金","じょせいきん","n","tiền hỗ trợ | trợ cấp tài trợ","subsidy | grant-in-aid","1344710"),
    ("給付金","きゅうふきん","n","tiền trợ cấp | khoản chi trả (an sinh)","(state) benefit | allowance | payment","1230330"),
    ("還付","かんぷ","n|vs|vt","hoàn lại | hoàn trả | hoàn thuế","return | refund | (duty) drawback","1614290"),
    ("控除","こうじょ","n|vs|vt","khấu trừ | trừ (thuế)","subtraction | deduction (of tax)","1279080"),
    ("延納","えんのう","n|vs|vt","nộp chậm | gia hạn nộp","deferred payment","1176530"),
    ("分納","ぶんのう","n|vs|vt","nộp làm nhiều lần | trả góp | giao theo đợt","installment payment | installment delivery","1504060"),
    ("完納","かんのう","n|vs|vt","nộp đủ | giao đủ | hoàn tất việc nộp","full payment or delivery","1665290"),
    ("免除","めんじょ","n|vs|vt","miễn | miễn trừ | tha","exemption | exoneration | discharge","1533200"),
    ("減免","げんめん","n|vs|vt","giảm và miễn (thuế) | giảm nhẹ và miễn","reduction and exemption (e.g. taxes)","1263340"),
    ("追徴","ついちょう","n|vs|vt","truy thu | thu thêm | phụ thu","supplementary charge | additional collection","1432600"),
    ("還元","かんげん","n|vs|vt|vi","hoàn trả | trả lại | khử (hóa học) | hoàn nguyên","restoration | return | reduction (chemistry)","1215130"),
    ("利益還元","りえきかんげん","n","hoàn lợi nhuận | trả lại lợi ích (cho khách, cổ đông)","returning profits to customers | distribution of profits","2841999"),
    ("内部留保","ないぶりゅうほ","n","lợi nhuận giữ lại | quỹ dự trữ nội bộ","internal reserves | retained profit","1792040"),
    ("資本提携","しほんていけい","n","liên kết vốn | hợp tác về vốn","capital tie-up | capital alliance","1994330"),
    ("業務提携","ぎょうむていけい","n","hợp tác kinh doanh | liên kết nghiệp vụ","business partnership","1239550"),
    ("持ち株","もちかぶ","n","cổ phần nắm giữ | cổ phiếu sở hữu","stock holdings | one's shares","1658420"),
    ("持ち分","もちぶん","n","phần sở hữu | phần vốn | cổ phần | phần đóng góp","share | equity (in company) | holdings","1769930"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
