# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n3-vi-ready-007.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    row("医療","いりょう","N3","n",
        "điều trị y tế | chăm sóc y tế",
        "medical treatment | medical care","1160140"),
    row("育て方","そだてかた","N3","n",
        "phương pháp nuôi dạy | cách nuôi trồng",
        "method of bringing up | method of raising","1160600"),
    row("育児","いくじ","N3","n|vs|vi",
        "chăm sóc trẻ em | nuôi dạy trẻ | điều dưỡng",
        "childcare | child-rearing | nursing | upbringing","1160630"),
    row("一括","いっかつ","N3","n|vs|vt",
        "gộp chung | tổng hợp | nhóm | giao dịch lô",
        "lumping together | summing up | bundle | lump | batch","1161470"),
    row("一貫","いっかん","N3","n|vs|vi",
        "sự nhất quán | sự đồng nhất | liên tục",
        "consistency | coherence | integration","1161570"),
    row("一期一会","いちごいちえ","N3","exp",
        "gặp gỡ một lần trong đời | cơ hội quý không lặp lại",
        "once-in-a-lifetime encounter | uniquely precious experience","1161700"),
    row("一挙両得","いっきょりょうとく","N3","exp",
        "một công đôi việc | giết hai con chim bằng một viên đá",
        "killing two birds with one stone | serving two ends","1161880"),
    row("加害","かがい","N3","n|vs|vt",
        "tấn công | bạo lực | gây hại (cho người khác)",
        "assault | violence | damaging (someone)","1190020"),
    row("加工","かこう","N3","n|vs|vt",
        "gia công | chế biến | xử lý | sản xuất",
        "manufacturing | processing | treatment | machining","1190120"),
    row("加速","かそく","N3","n|vs|vi",
        "gia tốc | tăng tốc | đẩy nhanh",
        "acceleration | speeding up","1190370"),
    row("加入","かにゅう","N3","n|vs|vi",
        "gia nhập | trở thành thành viên | đăng ký | đăng nhập",
        "joining (a club, organization, etc.) | becoming a member | entry | admission","1190430"),
    row("加筆","かひつ","N3","n|vs|vt",
        "chỉnh sửa văn bản | sửa đổi | hiệu đính",
        "improvement (to a piece of writing or painting) | revision | correction | touching up","1190540"),
    row("加齢","かれい","N3","n|vs|vi",
        "lão hóa | già đi | quá trình già hóa",
        "aging | ageing | growing older","1190690"),
    row("可愛らしい","かわいらしい","N3","adj-i",
        "dễ thương | xinh xắn | đáng yêu | đáng mến",
        "lovely | sweet | pretty | cute | adorable","1190740"),
    row("可決","かけつ","N3","n|vs|vt",
        "thông qua | chấp thuận | phê duyệt (dự luật)",
        "approval | adoption (of a motion, bill, etc.) | passage","1190810"),
    row("可否","かひ","N3","n",
        "đúng sai | ủng hộ và phản đối | tính phù hợp | khả năng",
        "propriety | right and wrong | advisability | possibility | pro and con","1191130"),
    row("可憐","かれん","N3","adj-na",
        "dịu dàng | đáng thương | dễ thương | đáng tội nghiệp",
        "sweet (e.g. young girls, flowers blooming) | touchingly lovely | cute | pitiful","1191250"),
    row("加盟","かめい","N3","n|vs|vi",
        "gia nhập (hiệp hội) | tham gia | liên kết | kết nạp",
        "joining (an association, agreement, etc.) | participation | affiliation | accession","1190580"),
    row("家屋","かおく","N3","n",
        "ngôi nhà | tòa nhà | công trình",
        "house | building","1191780"),
    row("家業","かぎょう","N3","n",
        "nghề gia truyền | kinh doanh gia đình | nghề nghiệp",
        "family business | family trade | one's occupation | one's trade","1191840"),
    row("家系","かけい","N3","n",
        "dòng họ | dòng dõi gia đình | huyết thống",
        "family lineage","1191900"),
    row("家計","かけい","N3","n",
        "kinh tế hộ gia đình | tài chính gia đình",
        "household economy | family finances","1191910"),
    row("家財","かざい","N3","n",
        "tài sản gia đình | đồ dùng gia đình | của cải gia đình",
        "household belongings | household goods | family fortune | family assets","1191950"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
