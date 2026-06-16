# -*- coding: utf-8 -*-
"""Build N2 ready wave 019 — IT, media/publishing, transportation, infrastructure."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-019.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("画面","がめん","n","màn hình | hình ảnh (trên màn hình) | cảnh","screen | image (on a screen) | scene","1197610"),
    ("複製","ふくせい","n|vs|vt","sao chép | nhân bản | tái bản","reproduction | duplication | reprinting","1501440"),
    ("圧縮","あっしゅく","n|vs|vt","nén | nén ép | tóm gọn | nén (dữ liệu)","compression | condensing | summarizing","1153080"),
    ("解凍","かいとう","n|vs|vt","rã đông | giải nén (dữ liệu)","thawing | defrosting | decompression (of data)","1199150"),
    ("再起動","さいきどう","n|vs|vt","khởi động lại | reboot","restart | reboot","1292490"),
    ("初期化","しょきか","n|vs|vt","khởi tạo | định dạng (đĩa) | khôi phục cài đặt gốc","initialization | formatting (a disk) | factory reset","1342640"),
    ("暗号","あんごう","n","mật mã | mã hóa | mật khẩu","code | password | cipher","1154430"),
    ("復号","ふくごう","n|vs","giải mã | giải mật mã","decoding | decryption","2068290"),
    ("回線","かいせん","n","đường truyền | đường dây | mạch (điện)","circuit | line","1199570"),
    ("帯域","たいいき","n","băng tần | dải tần | băng thông","band | zone | bandwidth","1410440"),
    ("切断","せつだん","n|vs|vt","cắt đứt | cắt rời | ngắt kết nối | cắt cụt","cutting | severance | amputation | disconnection","1385120"),
    ("遮断","しゃだん","n|vs|vt","cắt | chặn | cách ly | ngăn cách | phong tỏa","isolation | cut off | blockade | interception","1323320"),
    ("着信","ちゃくしん","n|vs|vi","có cuộc gọi đến | nhận (thư, tin nhắn)","incoming call | receiving (an email)","1423100"),
    ("転送","てんそう","n|vs|vt","chuyển tiếp | chuyển hướng | truyền (dữ liệu)","forwarding | redirection | transmission (of data)","1441250"),
    ("中傷","ちゅうしょう","n|vs|vt","bôi nhọ | vu khống | phỉ báng","slander | libel | defamation | smear","1424500"),
    ("炎上","えんじょう","n|vs|vi","bốc cháy ngùn ngụt | bùng nổ chỉ trích (trên mạng)","going up in flames | storm of criticism online","1177120"),
    ("拡散","かくさん","n|vs|vi","lan rộng | phát tán | khuếch tán | tán xạ","spreading | disseminating | diffusion","1205180"),
    ("閲覧","えつらん","n|vs|vt","xem | đọc | duyệt (web) | tra cứu","inspection | perusal | browsing (the web)","1175380"),
    ("転載","てんさい","n|vs|vt","đăng lại | sao đăng | tái đăng","reprinting | reproduction","1441160"),
    ("記載","きさい","n|vs|vt","ghi (trong tài liệu) | ghi chép | nêu | liệt kê","mention (in a document) | record | entry","1223230"),
    ("校正","こうせい","n|vs|vt","hiệu đính | soát lỗi in | hiệu chuẩn","proofreading | calibration","1279560"),
    ("刊行","かんこう","n|vs|vt","xuất bản | phát hành","publication | issue","1210570"),
    ("創刊","そうかん","n|vs|vt","sáng lập (báo/tạp chí) | ra số đầu tiên","foundation (of a newspaper) | first publication","1398320"),
    ("廃刊","はいかん","n|vs|vt","đình bản | ngừng xuất bản","ceasing to publish | discontinuance of publication","1625620"),
    ("増刊","ぞうかん","n|vs|vt","số đặc biệt | ấn bản thêm (tạp chí)","special issue (of a magazine)","1403170"),
    ("社説","しゃせつ","n","xã luận | bài bình luận của tòa soạn","editorial | leading article","1322890"),
    ("論説","ろんせつ","n|vs|vt","luận thuyết | bài bình luận | xã luận","article | commentary | editorial","1561740"),
    ("寄稿","きこう","n|vs|vt|vi","đóng góp bài viết | gửi bài (cho báo)","contribution (e.g. to newspaper)","1219710"),
    ("特報","とくほう","n|vs|vt","tin nóng | bản tin đặc biệt","news flash","1455340"),
    ("誤報","ごほう","n|vs|vt","đưa tin sai | tin nhầm | báo động giả","false report | misinformation | false alarm","1271470"),
    ("号外","ごうがい","n","số báo đặc biệt | ấn bản đột xuất","newspaper extra","1284230"),
    ("紙面","しめん","n","trang báo | mặt giấy | nội dung trên báo","space on a page | surface of paper","1311620"),
    ("鉄道","てつどう","n","đường sắt | đường ray | giao thông đường sắt","railroad | railway | rail transport","1437960"),
    ("車掌","しゃしょう","n","nhân viên soát vé tàu | trưởng tàu","(train) conductor","1323170"),
    ("徐行","じょこう","n|vs|vi","chạy chậm | giảm tốc độ | đi từ từ","going slowly | slowing down | reducing speed","1345590"),
    ("追突","ついとつ","n|vs|vi","đâm từ phía sau | va chạm phía sau","rear-end collision","1432640"),
    ("車道","しゃどう","n","lòng đường | đường dành cho xe","roadway | carriageway","1323210"),
    ("高架","こうか","adj-no|n","trên cao | cầu cạn | đường trên cao","elevated (structure) | overhead","1283310"),
    ("陸橋","りっきょう","n","cầu vượt | cầu cạn | cầu trên đường ray","overpass | flyover | viaduct","1612250"),
    ("有料","ゆうりょう","adj-no|n","có thu phí | mất tiền | đường thu phí","fee-charging | paid | toll road","1541690"),
    ("無料","むりょう","adj-no|n","miễn phí | không mất tiền","free (of charge) | gratuitous","1531040"),
    ("通行","つうこう","n|vs|vi","đi lại | qua lại | lưu thông | thông dụng","passage (of traffic) | common usage","1433180"),
    ("通過","つうか","n|vs|vi","đi qua | thông qua (luật) | đỗ (kỳ thi) | quá cảnh","passing through | transit | passage (of a bill)","1433070"),
    ("中継地","ちゅうけいじ","n","điểm trung chuyển | điểm dừng chân","stopping point | stopover","2062940"),
    ("発着","はっちゃく","n|vs|vi","đến và đi | xuất phát và đến nơi","arrival and departure","1477700"),
    ("各駅","かくえき","n","mỗi ga | tàu thường (dừng mọi ga)","every station | local train","1204890"),
    ("便","びん","n|n-suf","chuyến (bay, tàu, phà) | thư từ | cơ hội","flight | trip | mail | opportunity","1512360"),
    ("貨物","かもつ","n","hàng hóa | hàng vận chuyển","cargo | freight","1195890"),
    ("港湾","こうわん","n","cảng | bến cảng","harbour | port","1280030"),
    ("埠頭","ふとう","n","cầu tàu | bến tàu | cầu cảng","pier | wharf | quay | dock","1496470"),
    ("桟橋","さんばし","n","cầu cảng | cầu tàu | bến tàu","wharf | jetty | pier","1303650"),
    ("航空","こうくう","n","hàng không | việc bay","aviation | flying","1281270"),
    ("滑走路","かっそうろ","n","đường băng | đường cất hạ cánh","runway | airstrip | landing strip","1208740"),
    ("離陸","りりく","n|vs|vi","cất cánh","takeoff","1550970"),
    ("着陸","ちゃくりく","n|vs|vi","hạ cánh | đáp xuống","landing | touch down","1423280"),
    ("機体","きたい","n","thân máy bay | khung máy bay","fuselage | airframe","1221020"),
    ("舗装","ほそう","n|vs|vt","lát đường | trải nhựa | rải mặt đường","paving (a road) | surfacing | pavement","1514070"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
