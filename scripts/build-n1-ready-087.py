# -*- coding: utf-8 -*-
"""Build N1 ready wave 087 — advanced katakana loanwords (set 87)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-087.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("アスペクトレシオ","アスペクトレシオ","n","tỷ lệ khung hình | tỷ lệ chiều rộng và cao | tỷ số khía cạnh","aspect ratio","1016170"),
    ("アセット","アセット","n","tài sản | của cải | nguồn lực có giá trị","asset","2431720"),
    ("アノマリー","アノマリー","n","sự bất thường | điều dị biệt | hiện tượng lệch chuẩn","anomaly","2711940"),
    ("インヴェンション","インヴェンション","n","sự phát minh | sáng chế | sự sáng tạo","invention","1024860"),
    ("インタラクション","インタラクション","n","sự tương tác | sự tác động qua lại | sự giao tiếp","interaction","1023190"),
    ("インテグリティ","インテグリティ","n","tính chính trực | sự liêm chính | sự toàn vẹn | tính nhất quán","integrity","2864046"),
    ("インバランス","インバランス","n|adj-na","sự mất cân bằng | sự không cân đối | sự lệch","imbalance","1024000"),
    ("ヴァルネラビリティ","ヴァルネラビリティ","n","sự dễ tổn thương | điểm yếu | lỗ hổng bảo mật","vulnerability","2475470"),
    ("エクスプロージョン","エクスプロージョン","n","sự bùng nổ | vụ nổ | sự nổ tung","explosion","1028080"),
    ("エンドルフィン","エンドルフィン","n","endorphin | hooc-môn hạnh phúc | chất giảm đau nội sinh","endorphin","1031250"),
    ("オーソライズ","オーソライズ","n|vs","sự cho phép | sự cấp quyền | sự ủy quyền chính thức","authorization","1031740"),
    ("オートマトン","オートマトン","n","máy tự động | mô hình tự động | ô-tô-mát","automaton","1032140"),
    ("オピニオンリーダー","オピニオンリーダー","n","người dẫn dắt dư luận | người định hướng quan điểm | nhân vật có ảnh hưởng","opinion leader","1034590"),
    ("オリエンタリズム","オリエンタリズム","n","chủ nghĩa Đông phương | phong cách phương Đông | tư tưởng Đông phương luận","Orientalism","1035530"),
    ("ガイドポスト","ガイドポスト","n","cột chỉ đường | biển chỉ dẫn | mốc hướng dẫn","guidepost","1039930"),
    ("キャプチャー","キャプチャー","n|vs|vt","sự chụp lại | ảnh chụp màn hình | sự ghi lại (dữ liệu)","capture | screenshot","1041840"),
    ("キュレーター","キュレーター","n","người phụ trách trưng bày | giám tuyển | quản lý bảo tàng","curator","1042440"),
    ("グローバルスタンダード","グローバルスタンダード","n","tiêu chuẩn toàn cầu | chuẩn quốc tế | quy chuẩn thế giới","global standard","1986510"),
    ("ケーススタディ","ケーススタディ","n","nghiên cứu tình huống | phân tích trường hợp | ca nghiên cứu","case study","1047900"),
    ("コーチ","コーチ","n|vs|vt","huấn luyện viên | người hướng dẫn | sự huấn luyện","coach","1048910"),
    ("コミュナリズム","コミュナリズム","n","chủ nghĩa cộng đồng | chủ nghĩa cộng xã | tư tưởng cộng đồng tự quản","communalism","1050960"),
    ("コンサベーション","コンサベーション","n","sự bảo tồn | sự gìn giữ | bảo vệ (môi trường/di sản)","conservation","1052030"),
    ("サブミッション","サブミッション","n","đòn khóa siết (đầu hàng) | sự đầu hàng (võ thuật)","submission (in wrestling/judo)","2842189"),
    ("ジャーナリズム","ジャーナリズム","n","báo chí | nghề báo | hoạt động truyền thông","journalism","1064990"),
    ("シンクロニシティ","シンクロニシティ","n","sự trùng hợp ý nghĩa | sự đồng thời ngẫu nhiên | tính đồng bộ tâm linh","synchronicity","2474500"),
    ("スティグマ","スティグマ","n","sự kỳ thị | dấu ấn ô danh | định kiến xã hội | vết nhơ","stigma","2497790"),
    ("ストレッサー","ストレッサー","n","tác nhân gây căng thẳng | nguồn gây stress | yếu tố gây áp lực","stressor","2447620"),
    ("セルフエスティーム","セルフエスティーム","n","lòng tự trọng | sự tự tôn bản thân | giá trị bản thân","self-esteem","2447660"),
    ("タイポロジー","タイポロジー","n","loại hình học | sự phân loại theo dạng | hệ thống phân loại","typology","2832464"),
    ("チャーミング","チャーミング","adj-na","duyên dáng | quyến rũ | có sức hút | đáng yêu","charming","1077840"),
    ("ディーラー","ディーラー","n","đại lý | nhà phân phối | người chia bài | nhà buôn","dealer","1081610"),
    ("ディレクション","ディレクション","n","sự chỉ đạo | định hướng | phương hướng | sự dẫn dắt","direction","2828551"),
    ("デファクト","デファクト","adj-f","trên thực tế | thực tế (không chính thức) | mặc nhiên","de facto","1083700"),
    ("デモティック","デモティック","n","chữ bình dân | văn tự dân gian (Ai Cập cổ) | thuộc dân thường","demotic (script)","2463510"),
    ("トライアル","トライアル","n","cuộc thử nghiệm | giai đoạn dùng thử | thử thách | phiên thử","trial","1085550"),
    ("トラディショナル","トラディショナル","adj-na","truyền thống | cổ truyền | theo lối xưa","traditional","1085840"),
    ("ドミナント","ドミナント","n","nổi trội | chiếm ưu thế | áp đảo | (tính cách) lấn át","dominant","1088380"),
    ("ナラトロジー","ナラトロジー","n","tự sự học | lý thuyết trần thuật | khoa học về cách kể chuyện","narratology","2490540"),
    ("ノスタルジア","ノスタルジア","n","nỗi hoài niệm | nỗi nhớ quá khứ | sự luyến tiếc thời xưa","nostalgia","1093880"),
    ("ハイパー","ハイパー","adj-f","siêu | cực kỳ | quá mức | vượt trội","hyper","1095330"),
    ("パッセージ","パッセージ","n","đoạn văn | lối đi | đoạn nhạc | sự chuyển tiếp","passage","2491800"),
    ("ハンディキャップ","ハンディキャップ","n","sự bất lợi | điểm chấp | trở ngại | khuyết tật","handicap","1096680"),
    ("フォロワーシップ","フォロワーシップ","n","tinh thần người theo sau | vai trò cấp dưới | sự ủng hộ lãnh đạo","followership","2862659"),
    ("ブラッシュアップ","ブラッシュアップ","n|vs","sự trau chuốt | sự hoàn thiện | nâng cấp | mài giũa lại","brushing up | polishing","2276560"),
    ("フランチャイズ","フランチャイズ","n","nhượng quyền thương mại | hệ thống nhượng quyền | quyền kinh doanh","franchise","1111610"),
    ("プラトー","プラトー","n","trạng thái chững lại | giai đoạn ngưng tiến bộ | cao nguyên","plateau","1115830"),
    ("ブリリアント","ブリリアント","n","rực rỡ | xuất chúng | lấp lánh | tài hoa","brilliant","1114290"),
    ("プレゼンテーター","プレゼンテーター","n","người thuyết trình | người trình bày | diễn giả","presenter","2730460"),
    ("プロトコル","プロトコル","n","giao thức | nghi thức ngoại giao | quy trình chuẩn | phác đồ","protocol","1117670"),
    ("ベネフィット","ベネフィット","n","lợi ích | quyền lợi | điều có lợi","benefit","1119810"),
    ("ホリスティック","ホリスティック","adj-na","toàn diện | tổng thể | mang tính chỉnh thể","holistic","2183680"),
    ("マージナル","マージナル","n","ngoài lề | bên rìa | cận biên | thứ yếu","marginal","2489220"),
    ("マイグレーション","マイグレーション","n","sự di cư | sự di trú | sự chuyển đổi (hệ thống) | sự dời chuyển","migration","1126870"),
    ("マグニチュード","マグニチュード","n","cường độ (động đất) | độ lớn | tầm vóc | quy mô","magnitude","1127420"),
    ("モビリティー","モビリティー","n","tính cơ động | khả năng di chuyển | sự linh động | phương tiện đi lại","mobility","2025860"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
