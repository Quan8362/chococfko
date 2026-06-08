-- ============================================================
-- Phase 1: japanese_words table + seed data
-- ============================================================

CREATE TABLE IF NOT EXISTS public.japanese_words (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word         text NOT NULL,
  reading      text,
  romaji       text,
  jlpt_level   text,
  pos          text[],
  meanings     jsonb,
  examples     jsonb,
  tags         text[],
  search_text  text,
  frequency    int DEFAULT 0,
  is_published boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_japanese_words_word        ON public.japanese_words (word);
CREATE INDEX IF NOT EXISTS idx_japanese_words_reading     ON public.japanese_words (reading);
CREATE INDEX IF NOT EXISTS idx_japanese_words_romaji      ON public.japanese_words (romaji);
CREATE INDEX IF NOT EXISTS idx_japanese_words_jlpt_level  ON public.japanese_words (jlpt_level);
CREATE INDEX IF NOT EXISTS idx_japanese_words_is_published ON public.japanese_words (is_published);
CREATE INDEX IF NOT EXISTS idx_japanese_words_frequency   ON public.japanese_words (frequency DESC);

-- Trigram extension for fuzzy/partial text search (prepare for growth)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_japanese_words_search_trgm
  ON public.japanese_words USING gin (search_text gin_trgm_ops);

-- RLS
ALTER TABLE public.japanese_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published words" ON public.japanese_words;
CREATE POLICY "Public read published words"
  ON public.japanese_words FOR SELECT
  USING (is_published = true);

-- ============================================================
-- Seed data — 30 common words
-- ============================================================

INSERT INTO public.japanese_words
  (word, reading, romaji, jlpt_level, pos, meanings, examples, tags, search_text, frequency)
VALUES

-- N5 words (most common)
(
  '食べる', 'たべる', 'taberu', 'N5',
  ARRAY['verb'],
  '[{"vi": "ăn", "en": "to eat"}]'::jsonb,
  '[{"ja": "ご飯を食べます。", "reading": "ごはんをたべます。", "vi": "Tôi ăn cơm.", "en": "I eat rice."}]'::jsonb,
  ARRAY['N5', 'verb', 'daily'],
  '食べる たべる taberu ăn to eat', 1000
),
(
  '飲む', 'のむ', 'nomu', 'N5',
  ARRAY['verb'],
  '[{"vi": "uống", "en": "to drink"}]'::jsonb,
  '[{"ja": "水を飲みます。", "reading": "みずをのみます。", "vi": "Tôi uống nước.", "en": "I drink water."}]'::jsonb,
  ARRAY['N5', 'verb', 'daily'],
  '飲む のむ nomu uống to drink', 990
),
(
  '行く', 'いく', 'iku', 'N5',
  ARRAY['verb'],
  '[{"vi": "đi", "en": "to go"}]'::jsonb,
  '[{"ja": "学校に行きます。", "reading": "がっこうにいきます。", "vi": "Tôi đi học.", "en": "I go to school."}]'::jsonb,
  ARRAY['N5', 'verb', 'daily'],
  '行く いく iku đi to go', 980
),
(
  '来る', 'くる', 'kuru', 'N5',
  ARRAY['verb'],
  '[{"vi": "đến, lại", "en": "to come"}]'::jsonb,
  '[{"ja": "友達が来ます。", "reading": "ともだちがきます。", "vi": "Bạn bè đến.", "en": "My friend is coming."}]'::jsonb,
  ARRAY['N5', 'verb', 'daily'],
  '来る くる kuru đến to come', 975
),
(
  '見る', 'みる', 'miru', 'N5',
  ARRAY['verb'],
  '[{"vi": "nhìn, xem", "en": "to see, to watch"}]'::jsonb,
  '[{"ja": "テレビを見ます。", "reading": "テレビをみます。", "vi": "Tôi xem tivi.", "en": "I watch TV."}]'::jsonb,
  ARRAY['N5', 'verb', 'daily'],
  '見る みる miru nhìn xem to see watch', 970
),
(
  '聞く', 'きく', 'kiku', 'N5',
  ARRAY['verb'],
  '[{"vi": "nghe, hỏi", "en": "to hear, to ask, to listen"}]'::jsonb,
  '[{"ja": "音楽を聞きます。", "reading": "おんがくをききます。", "vi": "Tôi nghe nhạc.", "en": "I listen to music."}]'::jsonb,
  ARRAY['N5', 'verb', 'daily'],
  '聞く きく kiku nghe hỏi to hear ask listen', 960
),
(
  '勉強', 'べんきょう', 'benkyo', 'N5',
  ARRAY['noun', 'verb'],
  '[{"vi": "học, việc học", "en": "study, studying"}]'::jsonb,
  '[{"ja": "日本語を勉強します。", "reading": "にほんごをべんきょうします。", "vi": "Tôi học tiếng Nhật.", "en": "I study Japanese."}]'::jsonb,
  ARRAY['N5', 'noun', 'study'],
  '勉強 べんきょう benkyo học study', 950
),
(
  '学校', 'がっこう', 'gakko', 'N5',
  ARRAY['noun'],
  '[{"vi": "trường học", "en": "school"}]'::jsonb,
  '[{"ja": "学校に行きます。", "reading": "がっこうにいきます。", "vi": "Tôi đi trường.", "en": "I go to school."}]'::jsonb,
  ARRAY['N5', 'noun', 'place'],
  '学校 がっこう gakko trường học school', 940
),
(
  '仕事', 'しごと', 'shigoto', 'N5',
  ARRAY['noun'],
  '[{"vi": "công việc, việc làm", "en": "work, job"}]'::jsonb,
  '[{"ja": "仕事が忙しいです。", "reading": "しごとがいそがしいです。", "vi": "Công việc bận rộn.", "en": "Work is busy."}]'::jsonb,
  ARRAY['N5', 'noun', 'work'],
  '仕事 しごと shigoto công việc việc làm work job', 930
),
(
  '友達', 'ともだち', 'tomodachi', 'N5',
  ARRAY['noun'],
  '[{"vi": "bạn bè", "en": "friend"}]'::jsonb,
  '[{"ja": "友達と遊びます。", "reading": "ともだちとあそびます。", "vi": "Chơi cùng bạn bè.", "en": "I hang out with friends."}]'::jsonb,
  ARRAY['N5', 'noun', 'social'],
  '友達 ともだち tomodachi bạn bè friend', 920
),
(
  '電車', 'でんしゃ', 'densha', 'N5',
  ARRAY['noun'],
  '[{"vi": "tàu điện, xe điện", "en": "train, electric train"}]'::jsonb,
  '[{"ja": "電車で行きます。", "reading": "でんしゃでいきます。", "vi": "Tôi đi bằng tàu điện.", "en": "I go by train."}]'::jsonb,
  ARRAY['N5', 'noun', 'transport'],
  '電車 でんしゃ densha tàu điện xe điện train', 910
),
(
  '天気', 'てんき', 'tenki', 'N5',
  ARRAY['noun'],
  '[{"vi": "thời tiết", "en": "weather"}]'::jsonb,
  '[{"ja": "今日は天気がいいです。", "reading": "きょうはてんきがいいです。", "vi": "Hôm nay thời tiết đẹp.", "en": "The weather is nice today."}]'::jsonb,
  ARRAY['N5', 'noun', 'nature'],
  '天気 てんき tenki thời tiết weather', 900
),
(
  '料理', 'りょうり', 'ryori', 'N5',
  ARRAY['noun', 'verb'],
  '[{"vi": "nấu ăn, món ăn", "en": "cooking, dish, cuisine"}]'::jsonb,
  '[{"ja": "料理を作ります。", "reading": "りょうりをつくります。", "vi": "Tôi nấu ăn.", "en": "I cook a meal."}]'::jsonb,
  ARRAY['N5', 'noun', 'food'],
  '料理 りょうり ryori nấu ăn món ăn cooking cuisine dish', 890
),
(
  '買い物', 'かいもの', 'kaimono', 'N5',
  ARRAY['noun', 'verb'],
  '[{"vi": "mua sắm", "en": "shopping"}]'::jsonb,
  '[{"ja": "買い物に行きます。", "reading": "かいものにいきます。", "vi": "Tôi đi mua sắm.", "en": "I go shopping."}]'::jsonb,
  ARRAY['N5', 'noun', 'daily'],
  '買い物 かいもの kaimono mua sắm shopping', 880
),
(
  '病院', 'びょういん', 'byoin', 'N5',
  ARRAY['noun'],
  '[{"vi": "bệnh viện", "en": "hospital"}]'::jsonb,
  '[{"ja": "病院に行きます。", "reading": "びょういんにいきます。", "vi": "Tôi đi bệnh viện.", "en": "I go to the hospital."}]'::jsonb,
  ARRAY['N5', 'noun', 'place', 'health'],
  '病院 びょういん byoin bệnh viện hospital', 870
),

-- N4 words
(
  '便利', 'べんり', 'benri', 'N4',
  ARRAY['adjective'],
  '[{"vi": "tiện lợi, tiện ích", "en": "convenient, useful"}]'::jsonb,
  '[{"ja": "このアプリは便利です。", "reading": "このアプリはべんりです。", "vi": "Ứng dụng này tiện lợi.", "en": "This app is convenient."}]'::jsonb,
  ARRAY['N4', 'adjective'],
  '便利 べんり benri tiện lợi tiện ích convenient useful', 700
),
(
  '大切', 'たいせつ', 'taisetsu', 'N4',
  ARRAY['adjective'],
  '[{"vi": "quan trọng, quý giá", "en": "important, precious, valuable"}]'::jsonb,
  '[{"ja": "健康が大切です。", "reading": "けんこうがたいせつです。", "vi": "Sức khỏe rất quan trọng.", "en": "Health is important."}]'::jsonb,
  ARRAY['N4', 'adjective'],
  '大切 たいせつ taisetsu quan trọng quý giá important precious valuable', 690
),
(
  '経験', 'けいけん', 'keiken', 'N3',
  ARRAY['noun', 'verb'],
  '[{"vi": "kinh nghiệm, trải nghiệm", "en": "experience"}]'::jsonb,
  '[{"ja": "貴重な経験でした。", "reading": "きちょうなけいけんでした。", "vi": "Đó là trải nghiệm quý giá.", "en": "It was a valuable experience."}]'::jsonb,
  ARRAY['N3', 'noun'],
  '経験 けいけん keiken kinh nghiệm trải nghiệm experience', 570
),

-- N3 words
(
  '会議', 'かいぎ', 'kaigi', 'N3',
  ARRAY['noun'],
  '[{"vi": "cuộc họp, hội nghị", "en": "meeting, conference"}]'::jsonb,
  '[{"ja": "明日会議があります。", "reading": "あしたかいぎがあります。", "vi": "Ngày mai có cuộc họp.", "en": "There is a meeting tomorrow."}]'::jsonb,
  ARRAY['N3', 'noun', 'work'],
  '会議 かいぎ kaigi cuộc họp hội nghị meeting conference', 560
),
(
  '説明', 'せつめい', 'setsumei', 'N3',
  ARRAY['noun', 'verb'],
  '[{"vi": "giải thích, giải trình", "en": "explanation, to explain"}]'::jsonb,
  '[{"ja": "わかりやすく説明します。", "reading": "わかりやすくせつめいします。", "vi": "Tôi giải thích dễ hiểu.", "en": "I will explain clearly."}]'::jsonb,
  ARRAY['N3', 'noun', 'communication'],
  '説明 せつめい setsumei giải thích explanation explain', 550
),
(
  '問題', 'もんだい', 'mondai', 'N3',
  ARRAY['noun'],
  '[{"vi": "vấn đề, bài toán", "en": "problem, question, issue"}]'::jsonb,
  '[{"ja": "何か問題がありますか？", "reading": "なにかもんだいがありますか？", "vi": "Có vấn đề gì không?", "en": "Is there any problem?"}]'::jsonb,
  ARRAY['N3', 'noun'],
  '問題 もんだい mondai vấn đề bài toán problem question issue', 540
),
(
  '準備', 'じゅんび', 'junbi', 'N3',
  ARRAY['noun', 'verb'],
  '[{"vi": "chuẩn bị", "en": "preparation, to prepare"}]'::jsonb,
  '[{"ja": "旅行の準備をします。", "reading": "りょこうのじゅんびをします。", "vi": "Chuẩn bị cho chuyến đi.", "en": "I prepare for the trip."}]'::jsonb,
  ARRAY['N3', 'noun'],
  '準備 じゅんび junbi chuẩn bị preparation prepare', 530
),
(
  '確認', 'かくにん', 'kakunin', 'N3',
  ARRAY['noun', 'verb'],
  '[{"vi": "xác nhận, kiểm tra", "en": "confirmation, to confirm, to check"}]'::jsonb,
  '[{"ja": "もう一度確認します。", "reading": "もういちどかくにんします。", "vi": "Tôi xác nhận lại một lần nữa.", "en": "I will confirm once more."}]'::jsonb,
  ARRAY['N3', 'noun', 'work'],
  '確認 かくにん kakunin xác nhận kiểm tra confirmation confirm check', 520
),
(
  '連絡', 'れんらく', 'renraku', 'N3',
  ARRAY['noun', 'verb'],
  '[{"vi": "liên lạc, liên hệ", "en": "contact, communication"}]'::jsonb,
  '[{"ja": "後で連絡します。", "reading": "あとでれんらくします。", "vi": "Tôi sẽ liên lạc sau.", "en": "I will contact you later."}]'::jsonb,
  ARRAY['N3', 'noun', 'communication'],
  '連絡 れんらく renraku liên lạc liên hệ contact communication', 510
),
(
  '原因', 'げんいん', 'genin', 'N3',
  ARRAY['noun'],
  '[{"vi": "nguyên nhân, lý do", "en": "cause, reason"}]'::jsonb,
  '[{"ja": "原因を調べます。", "reading": "げんいんをしらべます。", "vi": "Tôi điều tra nguyên nhân.", "en": "I investigate the cause."}]'::jsonb,
  ARRAY['N3', 'noun'],
  '原因 げんいん genin nguyên nhân lý do cause reason', 500
),
(
  '必要', 'ひつよう', 'hitsuyou', 'N3',
  ARRAY['adjective', 'noun'],
  '[{"vi": "cần thiết, sự cần thiết", "en": "necessary, necessity"}]'::jsonb,
  '[{"ja": "許可が必要です。", "reading": "きょかがひつようです。", "vi": "Cần có giấy phép.", "en": "Permission is necessary."}]'::jsonb,
  ARRAY['N3', 'adjective'],
  '必要 ひつよう hitsuyou cần thiết necessary necessity', 490
),

-- N2 words
(
  '修正', 'しゅうせい', 'shusei', 'N2',
  ARRAY['noun', 'verb'],
  '[{"vi": "sửa chữa, hiệu chỉnh", "en": "correction, revision, to fix"}]'::jsonb,
  '[{"ja": "文書を修正します。", "reading": "ぶんしょをしゅうせいします。", "vi": "Tôi sửa tài liệu.", "en": "I revise the document."}]'::jsonb,
  ARRAY['N2', 'noun', 'work'],
  '修正 しゅうせい shusei sửa chữa hiệu chỉnh correction revision fix', 360
),
(
  '対応', 'たいおう', 'taio', 'N2',
  ARRAY['noun', 'verb'],
  '[{"vi": "xử lý, ứng phó, đối ứng", "en": "response, handling, to deal with"}]'::jsonb,
  '[{"ja": "問題に対応します。", "reading": "もんだいにたいおうします。", "vi": "Tôi xử lý vấn đề.", "en": "I deal with the problem."}]'::jsonb,
  ARRAY['N2', 'noun', 'work'],
  '対応 たいおう taio xử lý ứng phó response handling', 350
),
(
  '申請', 'しんせい', 'shinsei', 'N2',
  ARRAY['noun', 'verb'],
  '[{"vi": "đăng ký, xin phép, nộp đơn", "en": "application, request, to apply"}]'::jsonb,
  '[{"ja": "ビザを申請します。", "reading": "ビザをしんせいします。", "vi": "Tôi xin visa.", "en": "I apply for a visa."}]'::jsonb,
  ARRAY['N2', 'noun', 'formal'],
  '申請 しんせい shinsei đăng ký xin phép nộp đơn application request apply', 340
),
(
  '承認', 'しょうにん', 'shonin', 'N2',
  ARRAY['noun', 'verb'],
  '[{"vi": "phê duyệt, chấp thuận", "en": "approval, to approve"}]'::jsonb,
  '[{"ja": "申請が承認されました。", "reading": "しんせいがしょうにんされました。", "vi": "Đơn đã được phê duyệt.", "en": "The application was approved."}]'::jsonb,
  ARRAY['N2', 'noun', 'formal'],
  '承認 しょうにん shonin phê duyệt chấp thuận approval approve', 330
),
(
  '状況', 'じょうきょう', 'jokyo', 'N2',
  ARRAY['noun'],
  '[{"vi": "tình huống, hoàn cảnh", "en": "situation, circumstances"}]'::jsonb,
  '[{"ja": "状況を確認します。", "reading": "じょうきょうをかくにんします。", "vi": "Tôi kiểm tra tình huống.", "en": "I check the situation."}]'::jsonb,
  ARRAY['N2', 'noun'],
  '状況 じょうきょう jokyo tình huống hoàn cảnh situation circumstances', 320
)

ON CONFLICT DO NOTHING;
