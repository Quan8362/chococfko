# -*- coding: utf-8 -*-
"""Build N1 ready wave 052 — 四字熟語 + literary 漢語 (set 52)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-052.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("気宇広大","きうこうだい","n","khí độ lớn lao | tấm lòng rộng mở | độ lượng bao dung | chí khí cao rộng","magnanimous | broad-minded","1221920"),
    ("奇怪","きかい","adj-na|n","kỳ quái | quái lạ | khó hiểu | bí hiểm | trắng trợn","strange | weird | mysterious | outrageous","1219300"),
    ("気骨稜々","きこつりょうりょう","adj-t|adv-to","khí phách hiên ngang | cốt cách cứng cỏi | tiết tháo kiên cường","having strong moral fiber","2040260"),
    ("規矩準縄","きくじゅんじょう","n","khuôn phép chuẩn mực | quy củ thước đo | tiêu chuẩn mẫu mực","rules and standards | norms","2043410"),
    ("旗鼓","きこ","n","cờ và trống | quân đội | binh mã (旗鼓堂々)","banners and drums | an army","1756960"),
    ("奇策","きさく","n","diệu kế kỳ lạ | mưu kế bất ngờ | nước cờ táo bạo | kế lạ","a bizarre plan | an outlandish scheme","1219340"),
    ("喜捨","きしゃ","n|vs|vt","bố thí | cúng dường | làm từ thiện | hỉ xả tài vật","almsgiving | charitable donation","1218830"),
    ("鬼神","きしん","n","quỷ thần | thần dữ | hung thần | thần linh dũng mãnh","a fierce god | a fearsome deity","1577770"),
    ("寄進","きしん","n|vs|vt","cúng tiến | hiến tặng (chùa, đền) | công đức | quyên góp","a contribution (to a temple/shrine) | a donation","1639640"),
    ("傷物","きずもの","n","hàng lỗi | đồ hư hỏng | hàng bị xước | gái đã mất trinh tiết","a defective article | damaged goods","1345940"),
    ("擬制","ぎせい","n","sự suy đoán pháp lý | quy ước pháp lý | giả định trong luật","a legal fiction","1225350"),
    ("気息","きそく","n","hơi thở | nhịp thở | hơi tàn (気息奄々: thoi thóp)","breathing | breath","1222440"),
    ("亀鑑","きかん","n","khuôn mẫu | tấm gương | mẫu mực | điển hình noi theo","a model | a paragon | an example","1224290"),
    ("机辺","きへん","n","bên bàn làm việc | cạnh bàn | quanh bàn học","near a desk","1757020"),
    ("基督","キリスト","n","Chúa Ki-tô | Đức Chúa Jesus | Christ","Christ","1042520"),
    ("急峻","きゅうしゅん","adj-na|n","dốc đứng | hiểm trở | dốc cao | cheo leo","steep | sharp (incline)","1615890"),
    ("旧套","きゅうとう","n","lối cũ | nếp xưa | tập quán cũ kỹ | khuôn sáo (旧套を脱する)","conventionalism | the old style","1231130"),
    ("急変","きゅうへん","n|vs|vi","biến chuyển đột ngột | thay đổi bất ngờ | sự cố khẩn cấp | trở nặng đột ngột","a sudden change | an emergency","1228960"),
    ("旧聞","きゅうぶん","n","tin cũ | chuyện cũ rích | tin tức lỗi thời","old news","1231250"),
    ("窮民","きゅうみん","n","dân nghèo khổ | người cùng khốn | dân bần cùng","the poor | destitute people","1230130"),
    ("教化","きょうか","n|vs|vt","giáo hóa | cảm hóa | khai sáng | giáo dục | tuyên truyền cải tạo","enlightenment | edification | indoctrination","1237000"),
    ("凶荒","きょうこう","n","mất mùa | nạn đói | mùa màng thất bát","poor crops | famine","1235420"),
    ("怯弱","きょうじゃく","n","nhút nhát | hèn nhát | yếu đuối | nhu nhược","cowardice | timidity","2588210"),
    ("協和","きょうわ","n|vs|vi","hòa hợp | đồng điệu | hòa thuận | hợp âm hòa hài","concord | harmony","1235840"),
    ("業苦","ごうく","n","nghiệp khổ | nỗi khổ do nghiệp báo | khổ ải kiếp trước","karmic suffering","1839160"),
    ("旭日","きょくじつ","n","mặt trời mọc | vầng dương lên | thái dương ban mai (旭日昇天)","the rising sun","1152790"),
    ("旭光","きょっこう","n","tia nắng bình minh | ánh dương buổi sớm | hào quang mặt trời mọc","the rays of the rising sun","1152780"),
    ("虚栄","きょえい","n","hư vinh | sĩ diện hão | phù phiếm | háo danh (虚栄心)","vanity | vainglory","1232660"),
    ("挙国","きょこく","n","cả nước | toàn quốc | toàn dân tộc (挙国一致)","the whole nation","1232540"),
    ("虚飾","きょしょく","n|adj-no","phô trương | hào nhoáng giả tạo | màu mè | sĩ diện bề ngoài","ostentation | show | affectation","1232730"),
    ("虚心","きょしん","adj-na|n","tâm rỗng không thành kiến | cởi mở | vô tư | hư tâm (虚心坦懐)","open-minded | free from preconceptions","1232740"),
    ("許否","きょひ","n","chấp thuận hay không | đồng ý hay bác bỏ | thuận hay từ chối","approval and disapproval","1776330"),
    ("毀誉","きよ","n","khen chê | tiếng khen tiếng chê | lời ngợi khen và phê phán (毀誉褒貶)","praise and censure","1565780"),
    ("虚妄","きょもう","n","hư vọng | dối trá | điều giả dối | lời bịa đặt","falsehood | untruth | a lie","1232840"),
    ("切れ者","きれもの","n","người sắc sảo | tay cứng cựa | người tài giỏi lanh lợi | bậc kỳ tài","a sharp and able person","1591950"),
    ("近影","きんえい","n","ảnh chân dung gần đây | ảnh mới chụp | hình mới nhất","a recent photograph (of a person)","1780690"),
    ("近郷","きんごう","n","vùng lân cận | vùng quê quanh đó | làng mạc kế cận","neighboring districts | the countryside","1242270"),
    ("近来","きんらい","n|adv","gần đây | dạo này | thời gian gần đây | thời nay","recently | lately","1242560"),
    ("金襴","きんらん","n","gấm thêu kim tuyến | vải gấm dệt chỉ vàng | lụa gấm vàng","gold brocade","1682690"),
    ("偶感","ぐうかん","n","cảm nghĩ chợt đến | suy nghĩ vu vơ | tản mạn cảm tưởng","random thoughts","1246200"),
    ("偶吟","ぐうぎん","n","thơ ngẫu hứng | bài thơ tức cảnh | vịnh tùy hứng","an impromptu poem","1246210"),
    ("苦難","くなん","n","khổ nạn | gian khổ | hoạn nạn | thử thách | đau khổ","suffering | hardship | trial","1244590"),
    ("苦楽","くらく","n","khổ và sướng | buồn vui sướng khổ | đắng cay ngọt bùi (苦楽を共にする)","pleasure and pain | joys and sorrows","1244430"),
    ("苦慮","くりょ","n|vs|vi","trăn trở | vắt óc lo nghĩ | khổ tâm suy tính | day dứt","racking one's brains | worrying","1244660"),
    ("群書","ぐんしょ","n","sách vở nhiều | nhiều tác phẩm | quần thư (群書を渉猟)","many books | many writings","2248850"),
    ("薫育","くんいく","n|vs","giáo dưỡng | cảm hóa bằng đức độ | hun đúc nhân cách","moral education | edifying influence","1833070"),
    ("君臣","くんしん","n","vua tôi | quân thần | chủ và tớ | bề trên kẻ dưới","ruler and ruled | master and servant","1247300"),
    ("群盲","ぐんもう","n","đám đông mù quáng | quần chúng ngu muội (群盲象を撫でる: thầy bói xem voi)","the ignorant masses","1667860"),
    ("慶賀","けいが","n|vs|vt","chúc mừng | khánh hạ | mừng rỡ chúc tụng | ăn mừng","celebration | congratulation","1250510"),
    ("傾城傾国","けいせいけいこく","n","khuynh thành khuynh quốc | mỹ nhân nghiêng nước nghiêng thành | hồng nhan họa thủy","a femme fatale | a woman whose beauty brings ruin","2030680"),
    ("警世","けいせい","n|vs","cảnh tỉnh xã hội | lời cảnh báo người đời | thức tỉnh thế nhân","warning to society","1830880"),
    ("継走","けいそう","n|vs|vi","chạy tiếp sức | đua tiếp sức","a relay race","1251800"),
    ("獣道","けものみち","n","đường mòn thú đi | lối thú rừng | đường mòn hoang dã","an animal trail | a game trail","1636790"),
    ("喧々","けんけん","adv-to|adj-t","ồn ào | huyên náo | inh ỏi | ầm ĩ (喧々囂々)","noisily | clamorously","2853140"),
    ("原始","げんし","n|adj-no","nguyên thủy | sơ khai | ban sơ | thời tiền sử | nguồn gốc","origin | primeval | primitive","1261500"),
    ("堅持","けんじ","n|vs|vt","kiên trì giữ vững | giữ vững lập trường | duy trì kiên định | bám chắc","adhering firmly to | steadfastly maintaining","1257150"),
    ("献酬","けんしゅう","n|vs|vt","chuốc rượu qua lại | mời rượu nhau | trao đổi chén rượu","exchanging sake cups","1636850"),
    ("権勢","けんせい","n","quyền thế | quyền lực | thế lực | uy quyền (権勢を振るう)","power | influence","1258140"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
