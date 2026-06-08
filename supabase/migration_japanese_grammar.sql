-- japanese_grammar table + seed data (Phase 3)

create table if not exists japanese_grammar (
  id          uuid        primary key default gen_random_uuid(),
  pattern     text        not null,
  jlpt_level  text,
  meaning_vi  text,
  meaning_en  text,
  structure   text,
  notes       text,
  examples    jsonb,
  tags        text[],
  is_published boolean    default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_japanese_grammar_pattern     on japanese_grammar(pattern);
create index if not exists idx_japanese_grammar_jlpt_level  on japanese_grammar(jlpt_level);
create index if not exists idx_japanese_grammar_is_published on japanese_grammar(is_published);

alter table japanese_grammar enable row level security;

create policy "Public can read published grammar"
  on japanese_grammar for select
  using (is_published = true);

-- ────────────────────────────────────────────────────────────────
-- Seed: 5 patterns per level (N5 – N1)
-- ────────────────────────────────────────────────────────────────
insert into japanese_grammar
  (pattern, jlpt_level, meaning_vi, meaning_en, structure, notes, examples)
values
-- ── N5 ────────────────────────────────────────────────────────
('〜です', 'N5',
  'Là …, (khẳng định lịch sự)',
  'Is / am / are (polite)',
  'Danh từ / Tính từ-na ＋ です',
  null,
  '[{"ja":"これは本です。","reading":"これはほんです。","vi":"Đây là sách.","en":"This is a book."}]'),

('〜ます', 'N5',
  '(Động từ) một cách lịch sự',
  'Polite verb ending',
  'Thân động từ ＋ ます',
  'Dùng ở thể lịch sự, cuối câu khẳng định hiện tại / tương lai.',
  '[{"ja":"毎日学校へ行きます。","reading":"まいにちがっこうへいきます。","vi":"Mỗi ngày tôi đi học.","en":"I go to school every day."}]'),

('〜ませんか', 'N5',
  'Bạn có muốn … không? (mời lịch sự)',
  'Won''t you …? / Shall we …?',
  'Thân động từ ＋ ませんか',
  'Dùng để mời hoặc đề nghị ai đó làm gì cùng mình.',
  '[{"ja":"一緒に昼ご飯を食べませんか。","reading":"いっしょにひるごはんをたべませんか。","vi":"Bạn có muốn ăn trưa cùng nhau không?","en":"Shall we have lunch together?"}]'),

('〜たい', 'N5',
  'Muốn làm …',
  'Want to do …',
  'Thân động từ ＋ たい',
  'Chỉ diễn đạt mong muốn của người nói, không dùng cho người khác.',
  '[{"ja":"日本語を話したいです。","reading":"にほんごをはなしたいです。","vi":"Tôi muốn nói tiếng Nhật.","en":"I want to speak Japanese."}]'),

('〜てください', 'N5',
  'Xin hãy làm … (yêu cầu lịch sự)',
  'Please do …',
  'Thể て của động từ ＋ ください',
  'Dùng để đưa ra yêu cầu hoặc hướng dẫn một cách lịch sự.',
  '[{"ja":"ここに名前を書いてください。","reading":"ここになまえをかいてください。","vi":"Xin hãy viết tên của bạn vào đây.","en":"Please write your name here."}]'),

-- ── N4 ────────────────────────────────────────────────────────
('〜ながら', 'N4',
  'Vừa … vừa … (hai hành động cùng lúc)',
  'While doing …, simultaneously …',
  'Thân ます của động từ ＋ ながら ＋ động từ chính',
  'Hành động phụ (ながら) diễn ra cùng hành động chính. Chủ ngữ phải là cùng một người.',
  '[{"ja":"音楽を聴きながら勉強します。","reading":"おんがくをきながらべんきょうします。","vi":"Tôi vừa nghe nhạc vừa học.","en":"I study while listening to music."}]'),

('〜たことがある', 'N4',
  'Đã từng … (kinh nghiệm trong quá khứ)',
  'Have done … before (past experience)',
  'Thể た của động từ ＋ ことがある',
  'Diễn đạt kinh nghiệm đã từng có trong quá khứ, không nhất thiết gần đây.',
  '[{"ja":"富士山に登ったことがあります。","reading":"ふじさんにのぼったことがあります。","vi":"Tôi đã từng leo núi Phú Sĩ.","en":"I have climbed Mount Fuji before."}]'),

('〜ようになる', 'N4',
  'Trở nên có thể …, bắt đầu … (thay đổi trạng thái)',
  'Come to do …, become able to …',
  'Động từ thể từ điển / ない ＋ ようになる',
  'Diễn đạt sự thay đổi dần dần về khả năng hoặc thói quen.',
  '[{"ja":"毎日練習して、泳げるようになりました。","reading":"まいにちれんしゅうして、およげるようになりました。","vi":"Nhờ luyện tập mỗi ngày, tôi đã có thể bơi được.","en":"By practicing every day, I became able to swim."}]'),

('〜てしまう', 'N4',
  'Lỡ …, đã … mất (hoàn thành, thường có hối tiếc)',
  'End up doing …, unfortunately did …',
  'Thể て của động từ ＋ しまう',
  'Diễn đạt hành động hoàn thành, thường mang sắc thái hối tiếc hoặc không chủ tâm.',
  '[{"ja":"財布を忘れてしまいました。","reading":"さいふをわすれてしまいました。","vi":"Tôi đã lỡ quên mất ví.","en":"I forgot my wallet (unfortunately)."}]'),

('〜と思う', 'N4',
  'Tôi nghĩ rằng …',
  'I think that …',
  'Câu ＋ と思う',
  'Diễn đạt ý kiến hoặc suy nghĩ của người nói. Dùng với thể thường (普通形).',
  '[{"ja":"明日は晴れると思います。","reading":"あしたははれるとおもいます。","vi":"Tôi nghĩ ngày mai sẽ đẹp trời.","en":"I think it will be sunny tomorrow."}]'),

-- ── N3 ────────────────────────────────────────────────────────
('〜ために', 'N3',
  'Để …, vì mục đích …',
  'In order to …, for the purpose of …',
  'Động từ thể từ điển / Danh từ の ＋ ために',
  'Diễn đạt mục đích. Chủ ngữ hai vế thường là cùng một người.',
  '[{"ja":"日本語を上手になるために、毎日勉強します。","reading":"にほんごをじょうずになるために、まいにちべんきょうします。","vi":"Để giỏi tiếng Nhật, tôi học mỗi ngày.","en":"I study every day in order to become good at Japanese."}]'),

('〜ように', 'N3',
  'Để …, sao cho … (mục đích / mong muốn)',
  'So that …, in order to …',
  'Động từ thể từ điển / ない ＋ ように',
  'Khác 〜ために ở chỗ dùng khi động từ chủ vế thứ hai là phi ý chí hoặc khả năng.',
  '[{"ja":"遅刻しないように、早く起きます。","reading":"ちこくしないように、はやくおきます。","vi":"Để không đi trễ, tôi dậy sớm.","en":"I wake up early so that I am not late."}]'),

('〜ばかり', 'N3',
  'Chỉ …, toàn …, vừa mới …',
  'Only …, just …, nothing but …',
  'Động từ / Danh từ ＋ ばかり',
  'Có nhiều cách dùng: "toàn làm A mà không làm B", "vừa mới làm A xong".',
  '[{"ja":"彼はゲームばかりしている。","reading":"かれはゲームばかりしている。","vi":"Anh ấy chỉ chơi game thôi.","en":"He does nothing but play games."}]'),

('〜ことにする', 'N3',
  'Quyết định …',
  'Decide to …',
  'Động từ thể từ điển / ない ＋ ことにする',
  'Diễn đạt quyết định của người nói (có chủ ý). Khác 〜ことになる là quyết định do hoàn cảnh.',
  '[{"ja":"来年、日本へ留学することにしました。","reading":"らいねん、にほんへりゅうがくすることにしました。","vi":"Tôi đã quyết định đi du học Nhật năm sau.","en":"I have decided to study abroad in Japan next year."}]'),

('〜わけではない', 'N3',
  'Không phải là …, không có nghĩa là …',
  'It doesn''t mean that …, it''s not that …',
  'Động từ / Tính từ (thể thường) ＋ わけではない',
  'Phủ nhận một kết luận mà người nghe có thể hiểu nhầm.',
  '[{"ja":"嫌いなわけではないが、あまり食べない。","reading":"きらいなわけではないが、あまりたべない。","vi":"Không phải là tôi không thích, nhưng tôi ít ăn.","en":"It''s not that I dislike it, but I don''t eat much of it."}]'),

-- ── N2 ────────────────────────────────────────────────────────
('〜に限らず', 'N2',
  'Không chỉ …, không giới hạn ở …',
  'Not only …, not limited to …',
  'Danh từ ＋ に限らず',
  'Dùng để mở rộng phạm vi, nghĩa là "không chỉ A mà còn B".',
  '[{"ja":"子供に限らず、大人もこの映画を楽しめる。","reading":"こどもにかぎらず、おとなもこのえいがをたのしめる。","vi":"Không chỉ trẻ em mà người lớn cũng có thể thưởng thức bộ phim này.","en":"Not only children but adults can also enjoy this film."}]'),

('〜に伴って', 'N2',
  'Cùng với …, khi … tăng lên thì …',
  'Along with …, as … increases …',
  'Danh từ / Động từ thể từ điển ＋ に伴って',
  'Diễn đạt hai sự thay đổi xảy ra song song.',
  '[{"ja":"技術の発展に伴って、生活も便利になった。","reading":"ぎじゅつのはってんにともなって、せいかつもべんりになった。","vi":"Cùng với sự phát triển của công nghệ, cuộc sống cũng trở nên tiện lợi hơn.","en":"As technology advances, life has also become more convenient."}]'),

('〜上で', 'N2',
  'Sau khi …, trong quá trình …',
  'After doing …, in the process of …, in terms of …',
  'Động từ thể た / Danh từ の ＋ 上で',
  'Diễn đạt điều kiện tiền đề hoặc lĩnh vực liên quan.',
  '[{"ja":"よく考えた上で、返事をします。","reading":"よくかんがえたうえで、へんじをします。","vi":"Sau khi suy nghĩ kỹ, tôi sẽ trả lời.","en":"After thinking it over carefully, I will give my answer."}]'),

('〜ものの', 'N2',
  'Mặc dù …, tuy … nhưng …',
  'Although …, even though …, but …',
  'Động từ / Tính từ (thể thường) ＋ ものの',
  'Vế sau thường trái ngược với kỳ vọng từ vế trước.',
  '[{"ja":"日本語を勉強したものの、まだ話せない。","reading":"にほんごをべんきょうしたものの、まだはなせない。","vi":"Mặc dù đã học tiếng Nhật, nhưng tôi vẫn chưa nói được.","en":"Although I studied Japanese, I still cannot speak it."}]'),

('〜わけにはいかない', 'N2',
  'Không thể …, không được phép …',
  'Cannot …, must not …, it is not possible to …',
  'Động từ thể từ điển / ない ＋ わけにはいかない',
  'Diễn đạt sự không thể làm gì vì lý do đạo đức, xã hội hoặc hoàn cảnh.',
  '[{"ja":"大事な約束があるので、遅刻するわけにはいかない。","reading":"だいじなやくそくがあるので、ちこくするわけにはいかない。","vi":"Vì có hẹn quan trọng nên tôi không thể đến trễ.","en":"Since I have an important appointment, I cannot be late."}]'),

-- ── N1 ────────────────────────────────────────────────────────
('〜に至るまで', 'N1',
  'Cho đến …, bao gồm cả …',
  'Up to …, ranging to …, including even …',
  'Danh từ ＋ に至るまで',
  'Nhấn mạnh phạm vi rộng, thường đi với「〜から〜に至るまで」.',
  '[{"ja":"部長から新入社員に至るまで全員が参加した。","reading":"ぶちょうからしんにゅうしゃいんにいたるまでぜんいんがさんかした。","vi":"Từ trưởng phòng cho đến nhân viên mới, tất cả đều tham gia.","en":"Everyone from the manager to the new employees participated."}]'),

('〜を皮切りに', 'N1',
  'Bắt đầu từ …, khởi đầu với …',
  'Beginning with …, starting from …, with … as the first step',
  'Danh từ ＋ を皮切りに（して）',
  'Diễn đạt một sự kiện là khởi đầu cho chuỗi sự kiện tiếp theo.',
  '[{"ja":"東京公演を皮切りに、全国ツアーが始まった。","reading":"とうきょうこうえんをかわきりに、ぜんこくツアーがはじまった。","vi":"Bắt đầu từ buổi diễn ở Tokyo, chuyến lưu diễn toàn quốc đã khởi động.","en":"Starting with the Tokyo performance, the nationwide tour began."}]'),

('〜までもない', 'N1',
  'Không cần phải …',
  'There is no need to …, needless to …',
  'Động từ thể từ điển ＋ までもない',
  'Diễn đạt rằng một hành động là không cần thiết vì sự việc đã rõ ràng.',
  '[{"ja":"言うまでもなく、健康が一番大切だ。","reading":"いうまでもなく、けんこうがいちばんたいせつだ。","vi":"Không cần phải nói thì ai cũng biết, sức khỏe là quan trọng nhất.","en":"Needless to say, health is the most important thing."}]'),

('〜ずにはおかない', 'N1',
  'Chắc chắn sẽ …, không thể không …',
  'Cannot help but …, will surely …, inevitably …',
  'Động từ thể ない ＋ ずにはおかない (する → せずにはおかない)',
  'Diễn đạt rằng kết quả là tất yếu hoặc người nói/tác nhân buộc phải làm.',
  '[{"ja":"この映画は観客を感動させずにはおかない。","reading":"このえいがはかんきゃくをかんどうさせずにはおかない。","vi":"Bộ phim này chắc chắn sẽ làm khán giả xúc động.","en":"This film cannot help but move the audience."}]'),

('〜に堪えない', 'N1',
  'Không thể chịu đựng được …, quá … không chịu nổi',
  'Cannot bear …, unbearable …, too … to endure',
  'Danh từ / Động từ thể từ điển ＋ に堪えない',
  'Diễn đạt cảm xúc mạnh, cả tiêu cực (đau khổ không chịu nổi) lẫn tích cực (cảm động vô cùng).',
  '[{"ja":"彼の活躍ぶりは見るに堪えない。","reading":"かれのかつやくぶりはみるにたえない。","vi":"Những gì anh ấy làm thật đáng xem / không thể chịu được khi nhìn vào.","en":"His performance is unbearable to watch."}]');
