# -*- coding: utf-8 -*-
"""Writes jmdict-n4-vi-ready-043.csv -- 13 rows."""

OUT = r"C:\Users\QuanLV17\Downloads\chococfko-web\web\data\japanese\jmdict-n4-vi-ready-043.csv"
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"

def q(v):
    return '"' + str(v).replace('"', '""') + '"'

def row(word, reading, lvl, pos, vi, en, src_id,
        ex_jp="", ex_rd="", ex_vi="", ex_en=""):
    return ",".join([
        q(word), q(reading), q(""), q(lvl), q(pos),
        q(vi), q(en), q(""), q("0"), q("jmdict"), q(src_id),
        q(LIC), q("JMdict/EDRDG"),
        q(ex_jp), q(ex_rd), q(ex_vi), q(ex_en),
        q("ai_draft"), q("jmdict_ai"),
    ])

ROWS = [
    row("意志","いし","N4","n",
        "ý chí | quyết tâm | ý muốn | chí nguyện",
        "will | volition | intention | intent | determination",
        "1156560",
        "強い意志を持つ。","つよいいしをもつ。",
        "Có ý chí mạnh mẽ.","Have a strong will."),
    row("意図","いと","N4","n|vs|vt",
        "ý định | mục đích | chủ ý",
        "intention | aim | design",
        "1156690",
        "意図を説明する。","いとをせつめいする。",
        "Giải thích ý định.","Explain one's intention."),
    row("傾向","けいこう","N4","n",
        "xu hướng | khuynh hướng | chiều hướng",
        "tendency | trend | inclination",
        "1249470",
        "最近の傾向。","さいきんのけいこう。",
        "Xu hướng gần đây.","Recent trends."),
    row("見落とす","みおとす","N4","v5s|vt",
        "bỏ sót | bỏ qua | không để ý thấy | nhìn mà không thấy",
        "to overlook | to fail to notice | to miss (seeing)",
        "1260140",
        "重要な点を見落とす。","じゅうようなてんをみおとす。",
        "Bỏ sót điểm quan trọng.","Overlook an important point."),
    row("取り除く","とりのぞく","N4","v5k|vt",
        "lấy đi | gỡ bỏ | loại bỏ | tháo gỡ",
        "to remove | to deinstall | to take away | to set apart",
        "1326780",
        "障害を取り除く。","しょうがいをとりのぞく。",
        "Loại bỏ chướng ngại.","Remove obstacles."),
    row("洗濯物","せんたくもの","N4","n",
        "quần áo cần giặt | đồ giặt | đồ phơi",
        "laundry | the washing",
        "1391020",
        "洗濯物を干す。","せんたくものをほす。",
        "Phơi đồ giặt.","Hang out the laundry."),
    row("踏み出す","ふみだす","N4","v5s|vi|vt",
        "bước về phía trước | tiến bước | khởi đầu | dấn thân",
        "to step forward | to step forth | to advance | to start | to embark on",
        "1450170",
        "一歩踏み出す。","いっぽふみだす。",
        "Bước một bước tiến lên.","Take one step forward."),
    row("動機","どうき","N4","n",
        "động cơ | động lực | nguyên nhân thúc đẩy",
        "motive | incentive | motif",
        "1451310",
        "犯罪の動機。","はんざいのどうき。",
        "Động cơ gây tội ác.","The motive for the crime."),
    row("例外","れいがい","N4","n",
        "ngoại lệ | trường hợp ngoại lệ | sự ngoại trừ",
        "exception",
        "1556410",
        "例外なくルールを守る。","れいがいなくるーるをまもる。",
        "Tuân thủ quy tắc không có ngoại lệ.","Follow the rules without exception."),
    row("まな板","まないた","N4","n",
        "thớt | thớt cắt thịt",
        "chopping board | cutting board",
        "1604140",
        "まな板で野菜を切る。","まないたでやさいをきる。",
        "Cắt rau trên thớt.","Cut vegetables on a chopping board."),
    row("ざる","ざる","N4","aux",
        "không ~ | chẳng ~ (phủ định văn ngữ cổ điển Nhật)",
        "not (classical/literary negative form)",
        "2098050",
        "やむをえざる事情。","やむをえざるじじょう。",
        "Hoàn cảnh không thể tránh khỏi.","Unavoidable circumstances."),
    row("鍋蓋","なべぶた","N4","n",
        "nắp nồi | nắp vung | bộ kiền (bộ thủ kanji số 8)",
        "pan lid | pot lid | kanji \"kettle lid\" radical (radical 8)",
        "1642440",
        "鍋蓋を外す。","なべぶたをはずす。",
        "Mở nắp nồi.","Remove the pot lid."),
    row("過程","かてい","N4","n",
        "quá trình | tiến trình | diễn tiến",
        "process | course | mechanism",
        "1196270",
        "学習の過程。","がくしゅうのかてい。",
        "Quá trình học tập.","The learning process."),
]

content = HEADER + "\n" + "\n".join(ROWS) + "\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Written {len(ROWS)} rows to {OUT}")
