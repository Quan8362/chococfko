# -*- coding: utf-8 -*-
OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-061.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id):
    return ",".join([q(word), q(reading), q(""), q(lvl), q(pos), q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"), q(""), q(""), q(""), q(""), q("ai_draft"), q("jmdict_ai")])

ROWS = [
    # 形跡 - 2 parts
    row("形跡","けいせき","N4","n",
        "dấu vết | bằng chứng",
        "traces | evidence","1250370"),
    # 掲示 - 5 parts
    row("掲示","けいじ","N4","n|vs|vt",
        "thông báo | bản tin | đăng tải | yết thị | biển báo",
        "notice | bulletin | post | posting | placard","1250620"),
    # 経過 - 7 parts
    row("経過","けいか","N4","n|vs|vt|vi",
        "sự trôi qua (của thời gian) | trôi qua | thời gian trôi | tiến triển | phát triển | diễn biến (sự kiện) | quá cảnh",
        "passage (of time) | elapsing | lapse | progress | development | course (of events) | transit","1251250"),
    # 経歴 - 3 parts
    row("経歴","けいれき","N4","n",
        "lý lịch | lai lịch | sự nghiệp",
        "personal history | background | career","1251690"),
    # 茎 - 2 parts
    row("茎","くき","N4","n",
        "cuống (hoa/lá) | thân cây",
        "stalk | stem","1251950"),
    # 継母 - 1 part
    row("継母","ままはは","N4","n",
        "mẹ kế",
        "stepmother","1251850"),
    # 継父 - 1 part
    row("継父","けいふ","N4","n",
        "bố dượng",
        "stepfather","1251840"),
    # 継続 - 5 parts
    row("継続","けいぞく","N4","n|vs|vt|vi",
        "tiếp tục | liên tục | duy trì | kiên trì | tiếp diễn",
        "continuation | continuance | maintenance | persistence | going on","1251810"),
    # 繋がり - 3 parts
    row("繋がり","つながり","N4","n",
        "kết nối | liên kết | quan hệ",
        "connection | link | relationship","1251870"),
    # 繋がる - 6 parts
    row("繋がる","つながる","N4","v5r|vi",
        "được nối lại với nhau | được kết nối với | được liên kết tới | dẫn đến | có liên quan đến | có quan hệ (huyết thống)",
        "to be tied together | to be connected to | to be linked to | to lead to | to be related to | to be related (by blood)","1251880"),
    # 繋ぐ - 13 parts
    row("繋ぐ","つなぐ","N4","v5g|vt",
        "kết nối | liên kết với nhau | buộc | cột lại | kiềm chế | duy trì | giữ gìn | giữ lại | chuyển máy (điện thoại) | kết nối người | phòng ngừa rủi ro | mua hoặc bán kỳ hạn | kết nối (đá)",
        "to connect | to link together | to tie | to fasten | to restrain | to maintain | to preserve | to keep | to transfer (phone call) | to put a person through | to hedge | to buy or sell forward | to connect (stones)","1251900"),
    # 繋げる - 4 parts
    row("繋げる","つなげる","N4","v1|vt",
        "kết nối | buộc | cột lại | chuyển máy (điện thoại)",
        "to connect | to tie | to fasten | to transfer (phone call)","1251910"),
    # 経つ - 2 parts
    row("経つ","たつ","N4","v5t|vi",
        "trôi qua (thời gian) | trôi đi",
        "to pass (of time) | to elapse","1251100"),
    # 経る - 8 parts
    row("経る","へる","N4","v1|vi",
        "qua đi | trôi qua | đi qua | đi qua (nơi nào đó) | trải qua | trải nghiệm | vượt qua | chịu đựng",
        "to pass | to elapse | to go by | to pass through | to go through | to experience | to go through | to undergo","1251110"),
    # 経営 - 5 parts
    row("経営","けいえい","N4","n|vs|vt",
        "quản lý | quản trị | điều hành | kinh doanh | chỉ đạo",
        "management | administration | operation | running (a business) | conducting","1251130"),
    # 経営者 - 2 parts
    row("経営者","けいえいしゃ","N4","n",
        "người quản lý | chủ doanh nghiệp",
        "manager | proprietor","1251200"),
    # 経理 - 2 parts
    row("経理","けいり","N4","n",
        "kế toán | quản lý tài chính",
        "accounting | administration (of money)","1251680"),
    # 経費 - 5 parts
    row("経費","けいひ","N4","n",
        "chi phí | chi tiêu | tiền chi | tiền bỏ ra | giá thành",
        "expenses | expenditure | outgoings | outlays | costs","1251640"),
    # 経路 - 6 parts
    row("経路","けいろ","N4","n",
        "quá trình | tuyến đường | đường đi | kênh | tiến trình | các giai đoạn",
        "course | route | path | channel | process | stages","1251700"),
    # 継ぐ - 13 parts
    row("継ぐ","つぐ","N4","v5g|vt",
        "kế thừa (vị trí, ai đó,...) | thừa kế | tiếp nhận | tiếp nối | vá (quần áo) | sửa | sửa chữa | thêm (ví dụ: than vào lửa) | bổ sung | tiếp liệu | tiếp tục (với nhận xét) | lấy lại (hơi thở) | kết nối (đá)",
        "to succeed (a person, to a position, etc.) | to inherit | to take over | to follow | to patch (clothes) | to mend | to repair | to add (e.g. charcoal to the fire) | to replenish with | to feed with | to follow up with (e.g. remarks) | to gather (one's breath) | to connect (stones)","1251750"),
    # 継子 - 1 part
    row("継子","ままこ","N4","n",
        "con riêng (con kế)",
        "stepchild","1251770"),
    # 継承 - 5 parts
    row("継承","けいしょう","N4","n|vs|vt",
        "thừa kế | kế thừa | tiếp nhận (chức vụ) | chia sẻ tương tự | thừa hưởng",
        "inheritance | succession | accession | share-alike | inheritance","1251780"),
    # 形式 - 10 parts
    row("形式","けいしき","N4","n",
        "hình thức (đối lập với nội dung) | định dạng | hình thức | phong cách | cách thức | tính hình thức | hình thức | chế độ | dạng | dạng thức (tuyến tính, bậc hai,...)",
        "form (as opposed to substance) | format | form | style | manner | formality | form | mode | form | form (bilinear, quadratic, etc.)","1250310"),
    # 形成 - 8 parts
    row("形成","けいせい","N4","n|vs|vt",
        "hình thành | tạo hình | cấu thành | lên hình | tạo hình cho | phẫu thuật (ví dụ: thẩm mỹ) | thay thế | tạo hình (-plasty)",
        "formation | molding | making (up) | taking form | giving form to | repair (e.g. with plastic surgery) | replacement | -plasty","1250360"),
    # 掲げる - 19 parts
    row("掲げる","かかげる","N4","v1|vt",
        "treo (thông báo, biển hiệu,...) | treo ra (ví dụ: băng rôn) | bay (ví dụ: cờ) | kéo lên cao | giơ lên | trưng bày | giơ cao lên | giơ lên đầu | tuyên truyền (nguyên tắc, kế hoạch,...) | nêu cao | giương cao (lý tưởng) | diễu hành (ví dụ: khẩu hiệu) | xuất bản | in ấn | đưa tin (ví dụ: bài báo) | xắn lên (ví dụ: tay áo) | cuộn lên | nhóm (lửa) | thổi bùng (ngọn lửa)",
        "to put up (a notice, sign, etc.) | to hang out (e.g. a banner) | to fly (e.g. a flag) | to hoist | to raise | to display | to hold up high | to raise overhead | to tout (a principle, plan, etc.) | to herald | to hold up (an ideal) | to parade (e.g. a slogan) | to publish | to print | to carry (e.g. an article) | to tuck up (e.g. sleeves) | to roll up | to stoke (a fire) | to fan (a flame)","1250600"),
    # 掲示板 - 5 parts
    row("掲示板","けいじばん","N4","n",
        "bảng tin | bảng thông báo | bảng yết thị | bảng thông báo điện tử | BBS",
        "bulletin board | display board | notice board | electronic bulletin board | BBS","1250630"),
    # 掲載 - 6 parts
    row("掲載","けいさい","N4","n|vs|vt",
        "đăng tải (ví dụ: bài báo) | đưa tin (ví dụ: câu chuyện) | chạy (ví dụ: truyện nhiều kỳ) | đặt (ví dụ: quảng cáo) | in ấn | đăng tải (ví dụ: trên web)",
        "publication (e.g. of an article in a newspaper) | carrying (e.g. a story) | running (e.g. a serial) | insertion (e.g. of an advertisement) | printing | posting (e.g. on the web)","1250610"),
    # 携える - 7 parts
    row("携える","たずさえる","N4","v1|vt",
        "cầm tay | mang theo | có mang bên người | mang vác | dẫn theo (ai đó) | đưa theo (ai đó) | được đi kèm bởi",
        "to carry in one's hand | to carry with one | to have on one's person | to bear | to take along (someone) | to take (someone) with one | to be accompanied by","1250650"),
    # 携わる - 4 parts
    row("携わる","たずさわる","N4","v5r|vi",
        "tham gia vào | tham dự | tham gia | có liên quan đến",
        "to engage in | to participate in | to take part in | to be involved in","1250660"),
    # 系列 - 8 parts
    row("系列","けいれつ","N4","n|adj-no",
        "chuỗi | trình tự | hệ thống | sự kế tiếp | keiretsu (nhóm công ty) | tập đoàn liên kết qua cổ phần chéo | liên kết | chi nhánh",
        "series | sequence | system | succession | keiretsu (group) | conglomeration of businesses linked by cross-shareholdings | affiliated | subsidiary","1251080"),
    # 系統 - 11 parts
    row("系統","けいとう","N4","n",
        "hệ thống | dòng dõi | tổ tiên | dòng tộc | nhóm (ví dụ: màu sắc) | họ (ví dụ: ngôn ngữ) | đảng | trường phái (tư tưởng) | quan hệ tiến hóa gần | quần thể có chung tổ tiên (di truyền học) | chủng (ví dụ: vi khuẩn)",
        "system | lineage | ancestry | family line | group (e.g. of colors) (colours) | family (e.g. of languages) | party | school (of thought) | close (evolutionary) relationship | a population sharing a common ancestor (in genetics) | strain (e.g. bacterial)","1251030"),
    # 計測 - 2 parts
    row("計測","けいそく","N4","n|vs|vt",
        "đo lường | phép đo",
        "measuring | measurement","1252230"),
    # 計算 - 11 parts
    row("計算","けいさん","N4","n|vs|vt",
        "tính toán | tính (toán) | tính nhẩm | đếm | cộng | làm tính | con số | xem xét | phép tính | ước tính | dự đoán",
        "calculation | computation | reckoning | counting | adding up | working out | figures | consideration | calculation | estimation | expectation","1252140"),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
