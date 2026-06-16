# -*- coding: utf-8 -*-
"""Build N1 ready wave 004 — formal Sino-Japanese nouns/verbs (set 4)."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n1-vi-ready-004.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N1"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("邦人","ほうじん","n","kiều bào Nhật (ở nước ngoài) | đồng bào","Japanese national (abroad) | fellow countryman","1518250"),
    ("冒涜","ぼうとく","n|vs|vt","báng bổ | xúc phạm | phỉ báng | làm ô uế","blasphemy | profanity | sacrilege | desecration","1603680"),
    ("翻弄","ほんろう","n|vs|vt","đùa giỡn | mặc sức trêu đùa | dắt mũi | vần vò","trifling with | toying with | leading around by the nose","1523440"),
    ("抹消","まっしょう","n|vs|vt","xóa bỏ | gạch bỏ | hủy bỏ | xóa tên","erasure | striking off | cancellation | deletion","1525200"),
    ("麻痺","まひ","n|vs|vi","tê liệt | bại liệt | đình trệ | mất cảm giác","paralysis | numbness | standstill","1604160"),
    ("満喫","まんきつ","n|vs|vt","tận hưởng | thưởng thức trọn vẹn | ăn uống thỏa thuê","enjoying to the full | having one's fill","1526760"),
    ("蔓延","まんえん","n|vs|vi","lây lan | tràn lan | hoành hành | lan rộng","spread (of disease) | rampancy | proliferation","1526950"),
    ("魅了","みりょう","n|vs|vt","mê hoặc | quyến rũ | làm say đắm | thu hút","to charm | to fascinate | to captivate","1528140"),
    ("猛威","もうい","n","sức mạnh dữ dội | sự hung hãn | uy lực khủng khiếp","fury | power | menace","1533970"),
    ("紋切り型","もんきりがた","adj-no|n","rập khuôn | sáo mòn | công thức | khuôn sáo","formulaic | stereotyped | hackneyed","1536130"),
    ("躍進","やくしん","n|vs|vi","tiến bộ vượt bậc | bứt phá | vươn lên mạnh mẽ","making rapid progress | great advances","1538460"),
    ("誘致","ゆうち","n|vs|vt","thu hút | mời gọi | lôi kéo (đầu tư, sự kiện)","attraction | lure | invitation","1541970"),
    ("憂慮","ゆうりょ","n|vs|vt","lo âu | quan ngại sâu sắc | bận lòng","anxiety | concern | fear","1540910"),
    ("幽閉","ゆうへい","n|vs|vt","giam cầm | giam lỏng | cầm tù | nhốt","confinement | imprisonment | incarceration","1540540"),
    ("雄弁","ゆうべん","n|adj-na","hùng biện | tài ăn nói | lưu loát","eloquence | fluency of speech","1542560"),
    ("余興","よきょう","n","tiết mục giải trí | trò vui (tiệc) | màn phụ diễn","entertainment (at a party) | side show","1544040"),
    ("余波","よは","n","dư âm | hệ lụy | hậu quả còn sót | sóng sau bão","after-effect | aftermath | lingering waves","1544470"),
    ("流布","るふ","n|vs|vt|vi|adj-no","lan truyền | phổ biến | truyền bá","circulation | dissemination","1552540"),
    ("零細","れいさい","adj-na","nhỏ lẻ | manh mún | vụn vặt | siêu nhỏ (doanh nghiệp)","insignificant | trifling | tiny (company)","1557680"),
    ("矮小","わいしょう","adj-na|n","nhỏ bé | lùn | còi cọc | thiển cận (tư duy)","diminutive | dwarfish | stunted | narrow (thinking)","1569990"),
    ("脇役","わきやく","n|adj-no","vai phụ | diễn viên phụ | vai trò thứ yếu","supporting role | minor role","1562560"),
    ("含蓄","がんちく","n|vs","hàm súc | ngụ ý sâu xa | thâm thúy | ý nghĩa sâu sắc","implication | connotation | depth of meaning","1216950"),
    ("願望","がんぼう","n|vs|vt","nguyện vọng | mong ước | khát vọng | ước nguyện","desire | wish | aspiration","1577710"),
    ("玩具","がんぐ","n","đồ chơi","toy","2863107"),
    ("偽善","ぎぜん","n|adj-no","đạo đức giả | giả nhân giả nghĩa","hypocrisy","1224560"),
    ("詭弁","きべん","n","ngụy biện | lý sự cùn | lập luận xảo trá","sophistry | sophism","1572650"),
    ("偶発","ぐうはつ","n|vs|vi|adj-no","bột phát | ngẫu nhiên | tình cờ xảy ra","sudden outbreak | accidental | incidental","1246360"),
    ("愚痴","ぐち","n|adj-na","lời than vãn | càu nhàu | phàn nàn | si mê (Phật giáo)","idle complaint | grumble | folly","1245170"),
    ("迎合","げいごう","n|vs|vi","xu nịnh | a dua | chiều theo | hùa theo","ingratiation | pandering | going along with","1253250"),
    ("形相","ぎょうそう","n","sắc mặt (giận dữ) | vẻ mặt | thần thái","look (esp. angry) | expression","1250380"),
    ("逆上","ぎゃくじょう","n|vs|vi","nổi điên | mất bình tĩnh | phát khùng | điên tiết","going into a frenzy | flying into a rage","1227100"),
    ("語弊","ごへい","n","cách nói dễ gây hiểu lầm | lời lẽ sai lệch","misleading statement | faulty statement","1271190"),
    ("怒号","どごう","n|vs|vi","tiếng gầm thét giận dữ | la hét om sòm","angry roar | bellow","1445710"),
    ("台無し","だいなし","adj-na|n","hỏng bét | tan tành | đổ bể | uổng phí","spoiled | ruined | wasted | messed up","1412770"),
    ("談合","だんごう","n|vs|vi","thông đồng (đấu thầu) | dàn xếp giá | bàn bạc","bid rigging | collusion | consultation","1420260"),
    ("墓穴","ぼけつ","n","huyệt mộ | mồ chôn (墓穴を掘る: tự đào hố chôn mình)","grave (pit)","1514850"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
