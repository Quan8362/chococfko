# -*- coding: utf-8 -*-
"""Build N1 ready wave 047 — formal/colloquial nouns + 慣用句 (set 47)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-047.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("前触れ","まえぶれ","n|vs|vi","điềm báo | dấu hiệu | thông báo trước | tiền triệu | điềm trước","an advance warning | a sign | an omen","1393320"),
    ("紛れ","まぎれ","n|n-suf","sự rối ren | lúc bị cuốn theo cảm xúc | trong cơn (giận, buồn) (紛れもない: rõ ràng)","confusion | being gripped by strong feelings","1640840"),
    ("幕切れ","まくぎれ","n","hạ màn | kết thúc | đoạn cuối | màn chót | chung cục","the fall of the curtain | the ending","1524800"),
    ("枕詞","まくらことば","n","chẩm từ | từ trang trí mở đầu (văn cổ) | lời mào đầu | lời dẫn nhập","a pillow word | a preface","1768670"),
    ("負け惜しみ","まけおしみ","n","cố chấp không nhận thua | ngụy biện khi thua | chống chế | nho xanh","being a poor loser | sour grapes","1498020"),
    ("勝る","まさる","v5r|vi","vượt trội | hơn hẳn | trội hơn | giỏi hơn | nhỉnh hơn","to excel | to surpass | to be superior","1603910"),
    ("摩擦熱","まさつねつ","n","nhiệt ma sát | nhiệt do cọ xát","frictional heat","1671690"),
    ("交わり","まじわり","n","sự giao thiệp | quan hệ | tình bằng hữu | giao hợp | giao điểm","acquaintance | relations | intersection","1271690"),
    ("股","また","n","háng | đùi | chạc (cây) | ngã ba | chỗ rẽ","the groin | the thigh | a fork (in a road, tree)","1267460"),
    ("瞬き","まばたき","n|vs|vi","chớp mắt | nháy mắt | lấp lánh (sao) | nhấp nháy (ánh sáng)","a blink | a wink | a twinkling","1580190"),
    ("丸儲け","まるもうけ","n|vs|vt|vi","lãi ròng | lời trọn | lãi to không vốn | hời trọn gói","clear profit | great profit without investment","1216720"),
    ("丸呑み","まるのみ","n|vs|vt","nuốt chửng | nuốt trọn | tin sái cổ | chấp nhận vô điều kiện | học vẹt","swallowing whole | accepting unconditionally","1216670"),
    ("満場","まんじょう","n|adj-no","cả hội trường | toàn thể khán giả | toàn thể (満場一致: nhất trí toàn thể)","the whole house | the whole audience","1526820"),
    ("満面","まんめん","n|adv|adj-no","cả khuôn mặt | tràn đầy gương mặt | rạng rỡ khắp mặt (満面の笑み)","the whole face | all over one's face","1611670"),
    ("見栄","みえ","n","sĩ diện | sự khoe mẽ | làm bộ | phô trương | hư vinh (見栄を張る)","show | pretensions | vanity | ostentation","1578350"),
    ("見限る","みかぎる","v5r|vt","từ bỏ | quay lưng | ruồng bỏ | bỏ rơi | hết hy vọng vào","to give up on | to abandon | to forsake","1611680"),
    ("右腕","みぎうで","n","cánh tay phải | trợ thủ đắc lực | tay phải | người tin cẩn","the right arm | a right-hand man","1171290"),
    ("水入り","みずいり","n","khoảng nghỉ (trận sumo kéo dài) | tạm dừng cho đô vật nghỉ","a break in a prolonged sumo bout","1736660"),
    ("水臭い","みずくさい","adj-i","khách sáo | giữ kẽ | xa cách | nhạt (rượu/cà phê) | thiếu thân tình","stand-offish | distant | watery","1611720"),
    ("水商売","みずしょうばい","n","nghề bấp bênh | nghề giải trí về đêm | quán bar | nghề rủi may","an uncertain trade | the nightlife business","1371620"),
    ("店構え","みせがまえ","n","kiểu trang trí cửa hàng | mặt tiền tiệm | bài trí cửa hiệu","a store's appearance (shop front)","1804560"),
    ("見せしめ","みせしめ","n","làm gương | dằn mặt | nêu gương răn đe | bài học cảnh cáo","making an example of | a warning","1259190"),
    ("乱す","みだす","v5s|vt","làm rối loạn | gây hỗn loạn | quấy rối | làm xáo trộn | làm bù xù","to throw into disorder | to disturb","1548930"),
    ("道筋","みちすじ","n","lộ trình | con đường | tuyến đường | mạch lập luận | hành trình","a path | a route | an itinerary","1454170"),
    ("未練たらしい","みれんたらしい","adj-i","lưu luyến dai dẳng | tiếc nuối không buông | cứ vương vấn | níu kéo","unwilling to give up | having lingering attachment","2836604"),
    ("見分け","みわけ","n","sự phân biệt | sự nhận biết | sự nhận ra (見分けがつかない)","distinction | discernment","1611860"),
    ("無駄足","むだあし","n|vs|vi","đi công cốc | đi uổng công | chuyến đi vô ích | mất công đi","a visit for no reason | a fool's errand","1530540"),
    ("無駄口","むだぐち","n","nói chuyện phiếm | tán gẫu | lời thừa | nói vô ích (無駄口を叩く)","idle chatter | idle talk","1642240"),
    ("名月","めいげつ","n","trăng rằm | trăng sáng | trăng tròn (rằm tháng 8 âm lịch)","the harvest moon | a bright full moon","1611960"),
    ("迷路","めいろ","n","mê cung | mê lộ | mê hồn trận | tai trong","a maze | a labyrinth","1532790"),
    ("召し物","めしもの","n","y phục | trang phục (kính ngữ) | quần áo","clothing (honorific)","1346400"),
    ("飯の種","めしのたね","exp|n","kế sinh nhai | nguồn thu nhập | cần câu cơm | miếng cơm manh áo","a means of making a living | bread and butter","2817710"),
    ("目論見書","もくろみしょ","n","bản cáo bạch | bản kế hoạch | bản giới thiệu chào bán","a prospectus","2029590"),
    ("目当て","めあて","n","mục đích | đích nhắm | mục tiêu | dấu mốc | điểm ngắm (súng)","an aim | a goal | a landmark | a gunsight","1535600"),
    ("目通り","めどおり","n","yết kiến (người quyền cao) | diện kiến | đường kính thân cây ngang tầm mắt","an audience (with a dignitary)","1808080"),
    ("面食らう","めんくらう","v5u|vi","bối rối | lúng túng | sững sờ | ngỡ ngàng | luống cuống","to be confused | to be bewildered | to be taken aback","1533490"),
    ("申し合わせ","もうしあわせ","n","thỏa thuận chung | đồng thuận | giao ước | nhất trí ngầm","a mutual agreement | a common understanding","1605120"),
    ("申し分","もうしぶん","n","điều phàn nàn | lời chê | điểm thiếu sót | ý kiến (申し分ない: hoàn hảo)","a complaint | a fault | one's say","1363030"),
    ("木魚","もくぎょ","n","mõ | mộc ngư | mõ tụng kinh","a wooden fish gong (struck while chanting sutras)","1807430"),
    ("目礼","もくれい","n|vs|vi","chào bằng mắt | gật đầu chào | đưa mắt chào","greeting with one's eyes | a nod","1618390"),
    ("物寂しい","ものさびしい","adj-i","cô quạnh | hiu hắt | đìu hiu | buồn vắng | quạnh quẽ","lonely | desolate","1664310"),
    ("物々しい","ものものしい","adj-i","nghiêm ngặt | canh phòng cẩn mật | phô trương | trịnh trọng | rình rang","strict (security) | heavy (guard) | pretentious | imposing","1722640"),
    ("門地","もんち","n","gia thế | dòng dõi | xuất thân | môn đệ","lineage | social standing","1536220"),
    ("野","や","n","cánh đồng | đồng nội | ngoài chính quyền | dân dã | đời tư (野に下る)","a plain | a field | being out of power | the private sector","2868256"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
