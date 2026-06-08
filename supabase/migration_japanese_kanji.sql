-- japanese_kanji table + seed data (Phase 3)

create table if not exists japanese_kanji (
  id           uuid        primary key default gen_random_uuid(),
  character    text        unique not null,
  jlpt_level   text,
  onyomi       text[],
  kunyomi      text[],
  meanings     jsonb,
  stroke_count int,
  radical      text,
  examples     jsonb,
  tags         text[],
  is_published boolean     default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_japanese_kanji_character    on japanese_kanji(character);
create index if not exists idx_japanese_kanji_jlpt_level   on japanese_kanji(jlpt_level);
create index if not exists idx_japanese_kanji_is_published on japanese_kanji(is_published);

alter table japanese_kanji enable row level security;

create policy "Public can read published kanji"
  on japanese_kanji for select
  using (is_published = true);

-- ────────────────────────────────────────────────────────────────
-- Seed: 10 kanji per level (N5, N4, N3)
-- ────────────────────────────────────────────────────────────────
insert into japanese_kanji
  (character, jlpt_level, onyomi, kunyomi, meanings, stroke_count, radical, examples)
values
-- ── N5 ────────────────────────────────────────────────────────
('日', 'N5',
  array['ニチ','ジツ'], array['ひ','か'],
  '[{"vi":"ngày, mặt trời","en":"day, sun"}]',
  4, '日',
  '[{"word":"日本","reading":"にほん","vi":"Nhật Bản","en":"Japan"},{"word":"今日","reading":"きょう","vi":"hôm nay","en":"today"}]'),

('月', 'N5',
  array['ゲツ','ガツ'], array['つき'],
  '[{"vi":"tháng, mặt trăng","en":"month, moon"}]',
  4, '月',
  '[{"word":"月曜日","reading":"げつようび","vi":"thứ Hai","en":"Monday"},{"word":"来月","reading":"らいげつ","vi":"tháng sau","en":"next month"}]'),

('火', 'N5',
  array['カ'], array['ひ'],
  '[{"vi":"lửa","en":"fire"}]',
  4, '火',
  '[{"word":"火曜日","reading":"かようび","vi":"thứ Ba","en":"Tuesday"},{"word":"火山","reading":"かざん","vi":"núi lửa","en":"volcano"}]'),

('水', 'N5',
  array['スイ'], array['みず'],
  '[{"vi":"nước","en":"water"}]',
  4, '水',
  '[{"word":"水曜日","reading":"すいようび","vi":"thứ Tư","en":"Wednesday"},{"word":"水泳","reading":"すいえい","vi":"bơi lội","en":"swimming"}]'),

('木', 'N5',
  array['モク','ボク'], array['き','こ'],
  '[{"vi":"cây, gỗ","en":"tree, wood"}]',
  4, '木',
  '[{"word":"木曜日","reading":"もくようび","vi":"thứ Năm","en":"Thursday"},{"word":"木材","reading":"もくざい","vi":"gỗ, vật liệu gỗ","en":"timber, lumber"}]'),

('金', 'N5',
  array['キン','コン'], array['かね','かな'],
  '[{"vi":"vàng, tiền","en":"gold, money"}]',
  8, '金',
  '[{"word":"金曜日","reading":"きんようび","vi":"thứ Sáu","en":"Friday"},{"word":"お金","reading":"おかね","vi":"tiền","en":"money"}]'),

('土', 'N5',
  array['ド','ト'], array['つち'],
  '[{"vi":"đất","en":"soil, earth"}]',
  3, '土',
  '[{"word":"土曜日","reading":"どようび","vi":"thứ Bảy","en":"Saturday"},{"word":"土地","reading":"とち","vi":"đất đai","en":"land"}]'),

('人', 'N5',
  array['ジン','ニン'], array['ひと'],
  '[{"vi":"người","en":"person"}]',
  2, '人',
  '[{"word":"日本人","reading":"にほんじん","vi":"người Nhật","en":"Japanese person"},{"word":"人口","reading":"じんこう","vi":"dân số","en":"population"}]'),

('大', 'N5',
  array['ダイ','タイ'], array['おお'],
  '[{"vi":"lớn, to","en":"big, large"}]',
  3, '大',
  '[{"word":"大学","reading":"だいがく","vi":"đại học","en":"university"},{"word":"大きい","reading":"おおきい","vi":"to, lớn","en":"big, large"}]'),

('小', 'N5',
  array['ショウ'], array['ちい','こ','お'],
  '[{"vi":"nhỏ, bé","en":"small, little"}]',
  3, '小',
  '[{"word":"小学校","reading":"しょうがっこう","vi":"trường tiểu học","en":"elementary school"},{"word":"小さい","reading":"ちいさい","vi":"nhỏ, bé","en":"small"}]'),

-- ── N4 ────────────────────────────────────────────────────────
('会', 'N4',
  array['カイ','エ'], array['あ'],
  '[{"vi":"gặp, hội họp","en":"meeting, association"}]',
  6, '人',
  '[{"word":"会社","reading":"かいしゃ","vi":"công ty","en":"company"},{"word":"会議","reading":"かいぎ","vi":"cuộc họp","en":"meeting"}]'),

('社', 'N4',
  array['シャ'], array['やしろ'],
  '[{"vi":"công ty, xã hội","en":"company, society"}]',
  7, '示',
  '[{"word":"会社","reading":"かいしゃ","vi":"công ty","en":"company"},{"word":"社会","reading":"しゃかい","vi":"xã hội","en":"society"}]'),

('店', 'N4',
  array['テン'], array['みせ'],
  '[{"vi":"cửa hàng, tiệm","en":"store, shop"}]',
  8, '广',
  '[{"word":"お店","reading":"おみせ","vi":"cửa hàng","en":"shop"},{"word":"書店","reading":"しょてん","vi":"nhà sách","en":"bookstore"}]'),

('駅', 'N4',
  array['エキ'], array[]::text[],
  '[{"vi":"ga tàu, nhà ga","en":"train station"}]',
  14, '馬',
  '[{"word":"駅前","reading":"えきまえ","vi":"trước ga","en":"in front of the station"},{"word":"駅員","reading":"えきいん","vi":"nhân viên ga","en":"station staff"}]'),

('電', 'N4',
  array['デン'], array[]::text[],
  '[{"vi":"điện","en":"electricity, electric"}]',
  13, '雨',
  '[{"word":"電車","reading":"でんしゃ","vi":"tàu điện","en":"train"},{"word":"電話","reading":"でんわ","vi":"điện thoại","en":"telephone"}]'),

('車', 'N4',
  array['シャ'], array['くるま'],
  '[{"vi":"xe, xe hơi","en":"car, vehicle"}]',
  7, '車',
  '[{"word":"電車","reading":"でんしゃ","vi":"tàu điện","en":"train"},{"word":"自動車","reading":"じどうしゃ","vi":"xe ô tô","en":"automobile"}]'),

('語', 'N4',
  array['ゴ'], array['かた'],
  '[{"vi":"ngôn ngữ, nói chuyện","en":"language, speech"}]',
  14, '言',
  '[{"word":"日本語","reading":"にほんご","vi":"tiếng Nhật","en":"Japanese language"},{"word":"英語","reading":"えいご","vi":"tiếng Anh","en":"English"}]'),

('読', 'N4',
  array['ドク','トク'], array['よ'],
  '[{"vi":"đọc","en":"read"}]',
  14, '言',
  '[{"word":"読書","reading":"どくしょ","vi":"đọc sách","en":"reading (books)"},{"word":"音読","reading":"おんどく","vi":"đọc to","en":"reading aloud"}]'),

('書', 'N4',
  array['ショ'], array['か'],
  '[{"vi":"viết, sách","en":"write, book"}]',
  10, '日',
  '[{"word":"教科書","reading":"きょうかしょ","vi":"sách giáo khoa","en":"textbook"},{"word":"書類","reading":"しょるい","vi":"giấy tờ, tài liệu","en":"documents"}]'),

('話', 'N4',
  array['ワ'], array['はな','はなし'],
  '[{"vi":"nói, câu chuyện","en":"speak, story"}]',
  13, '言',
  '[{"word":"会話","reading":"かいわ","vi":"hội thoại","en":"conversation"},{"word":"電話","reading":"でんわ","vi":"điện thoại","en":"telephone"}]'),

-- ── N3 ────────────────────────────────────────────────────────
('働', 'N3',
  array['ドウ'], array['はたら'],
  '[{"vi":"làm việc, lao động","en":"work, labor"}]',
  13, '人',
  '[{"word":"労働","reading":"ろうどう","vi":"lao động","en":"labor"},{"word":"働き者","reading":"はたらきもの","vi":"người chăm chỉ","en":"hard worker"}]'),

('業', 'N3',
  array['ギョウ','ゴウ'], array['わざ'],
  '[{"vi":"nghề nghiệp, ngành công nghiệp","en":"occupation, industry, business"}]',
  13, '木',
  '[{"word":"卒業","reading":"そつぎょう","vi":"tốt nghiệp","en":"graduation"},{"word":"産業","reading":"さんぎょう","vi":"công nghiệp","en":"industry"}]'),

('質', 'N3',
  array['シツ','チ'], array[]::text[],
  '[{"vi":"chất lượng, bản chất, câu hỏi","en":"quality, nature, question"}]',
  15, '貝',
  '[{"word":"質問","reading":"しつもん","vi":"câu hỏi","en":"question"},{"word":"品質","reading":"ひんしつ","vi":"chất lượng","en":"quality"}]'),

('問', 'N3',
  array['モン'], array['と'],
  '[{"vi":"hỏi, vấn đề","en":"question, problem"}]',
  11, '口',
  '[{"word":"質問","reading":"しつもん","vi":"câu hỏi","en":"question"},{"word":"問題","reading":"もんだい","vi":"vấn đề, bài toán","en":"problem"}]'),

('題', 'N3',
  array['ダイ'], array[]::text[],
  '[{"vi":"đề bài, chủ đề, tựa đề","en":"title, topic, problem"}]',
  18, '頁',
  '[{"word":"問題","reading":"もんだい","vi":"vấn đề","en":"problem"},{"word":"話題","reading":"わだい","vi":"chủ đề nói chuyện","en":"topic of conversation"}]'),

('意', 'N3',
  array['イ'], array[]::text[],
  '[{"vi":"ý, ý nghĩa, ý muốn","en":"meaning, intention, will"}]',
  13, '心',
  '[{"word":"意味","reading":"いみ","vi":"ý nghĩa","en":"meaning"},{"word":"意見","reading":"いけん","vi":"ý kiến","en":"opinion"}]'),

('味', 'N3',
  array['ミ'], array['あじ'],
  '[{"vi":"vị, mùi vị, ý nghĩa","en":"taste, flavor, meaning"}]',
  8, '口',
  '[{"word":"意味","reading":"いみ","vi":"ý nghĩa","en":"meaning"},{"word":"趣味","reading":"しゅみ","vi":"sở thích","en":"hobby"}]'),

('経', 'N3',
  array['ケイ','キョウ'], array['へ'],
  '[{"vi":"kinh qua, đi qua, quản lý","en":"pass through, manage, sutra"}]',
  11, '糸',
  '[{"word":"経験","reading":"けいけん","vi":"kinh nghiệm","en":"experience"},{"word":"経済","reading":"けいざい","vi":"kinh tế","en":"economy"}]'),

('験', 'N3',
  array['ケン','ゲン'], array[]::text[],
  '[{"vi":"kinh nghiệm, kỳ thi","en":"experience, test, exam"}]',
  18, '馬',
  '[{"word":"試験","reading":"しけん","vi":"kỳ thi","en":"exam"},{"word":"経験","reading":"けいけん","vi":"kinh nghiệm","en":"experience"}]'),

('選', 'N3',
  array['セン'], array['えら'],
  '[{"vi":"chọn, lựa chọn","en":"choose, select, elect"}]',
  15, '辵',
  '[{"word":"選択","reading":"せんたく","vi":"sự lựa chọn","en":"choice, selection"},{"word":"選手","reading":"せんしゅ","vi":"vận động viên","en":"player, athlete"}]');
