-- ── Place Translations ────────────────────────────────────────────────────────
-- Stores per-locale translations for place area, short_description, and body content.
-- locale = 'vi' row is migrated from the places table (canonical Vietnamese data).
-- Other locales are added by admin or via future AI/translation pipeline.

CREATE TABLE IF NOT EXISTS public.place_translations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  place_slug          text        NOT NULL,
  locale              text        NOT NULL,
  area                text,
  short_description   text,
  content             text,       -- rich HTML body (same format as places.body)
  translation_status  text        NOT NULL DEFAULT 'published'
                                  CHECK (translation_status IN ('draft', 'published')),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (place_slug, locale)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_place_translations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_place_translations_updated_at ON public.place_translations;
CREATE TRIGGER trg_place_translations_updated_at
  BEFORE UPDATE ON public.place_translations
  FOR EACH ROW EXECUTE FUNCTION update_place_translations_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.place_translations ENABLE ROW LEVEL SECURITY;

-- Public can read published translations
CREATE POLICY "place_translations_read" ON public.place_translations
  FOR SELECT USING (translation_status = 'published');

-- Only service role (admin) can insert/update/delete
-- (use createAdminClient() which bypasses RLS)

-- ── Migrate existing vi data from places table ────────────────────────────────
-- Copies current Vietnamese content into locale='vi' rows.
-- ON CONFLICT DO NOTHING prevents overwriting if already migrated.
INSERT INTO public.place_translations (place_slug, locale, area, short_description, content, translation_status)
SELECT
  slug,
  'vi',
  area,
  description,
  body,
  'published'
FROM public.places
WHERE slug IS NOT NULL
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── 10 Priority places — English translations ─────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
-- 1. Dazaifu Tenmangu
('dazaifu-tenmangu', 'en', 'Dazaifu',
 'Famous Shinto shrine dedicated to learning — try the sweet umegae-mochi',
 'published'),
-- 2. Canal City Hakata
('canal-city-hakata', 'en', 'Hakata',
 'Massive shopping complex with restaurants, shops, and dazzling fountain shows',
 'published'),
-- 3. Fukuoka Tower
('fukuoka-tower', 'en', 'Momochi',
 'Panoramic views of Fukuoka city and the sea from the tallest seaside tower in Japan',
 'published'),
-- 4. Ohori Park
('ohori-park', 'en', 'Chuo-ku',
 'Beautiful lake park — perfect for strolling, jogging, picnics, and nearby cafes',
 'published'),
-- 5. Maizuru Park / Fukuoka Castle Ruins
('maizuru-park-fukuoka-castle-ruins', 'en', 'Near Ohori',
 'Cherry blossoms at Fukuoka Castle ruins — a top walking and photography spot',
 'published'),
-- 6. Kushida Shrine
('kushida-shrine', 'en', 'Hakata',
 'Ancient guardian shrine of Hakata — host of the spectacular Yamakasa festival',
 'published'),
-- 7. Uminonakamichi Seaside Park
('uminonakamichi-seaside-park', 'en', 'Higashi-ku',
 'Vast seaside park — cycling, picnics, seasonal flowers, and great family fun',
 'published'),
-- 8. Marine World Uminonakamichi
('marine-world-uminonakamichi', 'en', 'Higashi-ku',
 'Large aquarium featuring dolphin and seal shows — ideal for a weekend day trip',
 'published'),
-- 9. Mojiko Retro
('mojiko-retro', 'en', 'Kitakyushu',
 'Charming retro port town with Meiji-era buildings — a dream for photographers',
 'published'),
-- 10. Yanagawa
('yanagawa', 'en', 'Yanagawa',
 'Scenic canal boat rides through a historic water town, paired with famous grilled eel',
 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── 10 Priority places — Japanese translations ────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('dazaifu-tenmangu', 'ja', '太宰府市',
 '学業成就で有名な天満宮。名物の梅ヶ枝餅も絶品',
 'published'),
('canal-city-hakata', 'ja', '博多',
 'ショッピング・グルメ・噴水ショーが楽しめる大型複合施設',
 'published'),
('fukuoka-tower', 'ja', '百道',
 '日本最高の海浜タワー。市街と玄界灘を一望できる展望台',
 'published'),
('ohori-park', 'ja', '中央区',
 '大濠湖を中心とした公園。散歩・ジョギング・デートにぴったり',
 'published'),
('maizuru-park-fukuoka-castle-ruins', 'ja', '大濠公園付近',
 '福岡城跡の桜の名所。散策・花見・撮影スポットとして人気',
 'published'),
('kushida-shrine', 'ja', '博多',
 '博多の総鎮守。毎年7月の博多祇園山笠で賑わう歴史ある神社',
 'published'),
('uminonakamichi-seaside-park', 'ja', '東区',
 '広大な国営海浜公園。サイクリング・ピクニック・季節の花が楽しめる',
 'published'),
('marine-world-uminonakamichi', 'ja', '東区',
 'イルカやアシカのショーも楽しめる大型水族館。週末のお出かけに最適',
 'published'),
('mojiko-retro', 'ja', '北九州市',
 '明治・大正時代の建物が残るレトロな港町。フォトスポットとして人気',
 'published'),
('yanagawa', 'ja', '柳川市',
 '水郷の町・柳川。川下りと鰻の蒸し焼きが名物',
 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── 10 Priority places — Korean translations ──────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('dazaifu-tenmangu', 'ko', '다자이후시',
 '학업 성취를 기원하는 유명 신사. 명물 매화떡도 꼭 드세요',
 'published'),
('canal-city-hakata', 'ko', '하카타',
 '쇼핑·맛집·분수 쇼를 즐길 수 있는 대형 복합 시설',
 'published'),
('fukuoka-tower', 'ko', '모모치',
 '일본 최고의 해변 타워. 후쿠오카 시내와 바다를 한눈에',
 'published'),
('ohori-park', 'ko', '주오구',
 '오호리 호수를 중심으로 한 공원. 산책·조깅·데이트에 최적',
 'published'),
('maizuru-park-fukuoka-castle-ruins', 'ko', '오호리 근처',
 '후쿠오카성 터의 벚꽃 명소. 산책과 사진 촬영에 최적인 곳',
 'published'),
('kushida-shrine', 'ko', '하카타',
 '하카타의 수호 신사. 매년 여름 야마카사 축제로 유명',
 'published'),
('uminonakamichi-seaside-park', 'ko', '히가시구',
 '광활한 국립 해변 공원. 자전거·피크닉·계절 꽃과 가족 나들이에 최적',
 'published'),
('marine-world-uminonakamichi', 'ko', '히가시구',
 '돌고래·물개 쇼를 즐길 수 있는 대형 수족관. 주말 나들이에 딱',
 'published'),
('mojiko-retro', 'ko', '기타큐슈시',
 '메이지·다이쇼 시대 건물이 남아있는 레트로 항구 마을. 사진 촬영 명소',
 'published'),
('yanagawa', 'ko', '야나가와시',
 '수향 마을 야나가와. 운하 유람선과 장어 요리가 유명',
 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── 10 Priority places — Chinese (Simplified) translations ────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('dazaifu-tenmangu', 'zh', '太宰府市',
 '以祈求学业成功闻名的神社，名物梅枝饼不可错过',
 'published'),
('canal-city-hakata', 'zh', '博多',
 '集购物、美食、喷泉表演于一体的大型综合设施',
 'published'),
('fukuoka-tower', 'zh', '百道',
 '日本最高的海滨塔，可俯瞰福冈市区与大海',
 'published'),
('ohori-park', 'zh', '中央区',
 '以大濠湖为中心的美丽公园，适合散步、慢跑与约会',
 'published'),
('maizuru-park-fukuoka-castle-ruins', 'zh', '大濠公园附近',
 '福冈城遗址的赏樱胜地，是散步和拍照的绝佳去处',
 'published'),
('kushida-shrine', 'zh', '博多',
 '博多的守护神社，以每年夏季的山笠祭著称',
 'published'),
('uminonakamichi-seaside-park', 'zh', '东区',
 '广阔的国立海滨公园，骑行、野餐、赏花，家庭出游的好去处',
 'published'),
('marine-world-uminonakamichi', 'zh', '东区',
 '可欣赏海豚和海狮表演的大型水族馆，适合周末出游',
 'published'),
('mojiko-retro', 'zh', '北九州市',
 '保留着明治大正时代建筑的复古港口小镇，摄影圣地',
 'published'),
('yanagawa', 'zh', '柳川市',
 '水乡柳川，乘船游河与鳗鱼蒲烧是必体验项目',
 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── Mountain / Hiking places — English ───────────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('mount-homan',      'en', 'Moderate · Very popular',     'The most famous peak near Dazaifu — well-marked trails and great views', 'published'),
('mount-tenpaizan',  'en', 'Easy · Beginner friendly',    'Gentle climb ideal for beginners, great views of the Chikugo plain', 'published'),
('mount-aburayama',  'en', 'Easy-Moderate · Near the city', 'Close to Fukuoka City — easy to access, popular for family hikes', 'published'),
('mount-sefuri',     'en', 'Moderate · Beautiful nature', 'On the Fukuoka–Saga border, beautiful forests and panoramic views', 'published'),
('mount-raizan',     'en', 'Moderate · Best in autumn',   'Itoshima mountain famous for its stunning autumn foliage', 'published'),
('mount-tachibana',  'en', 'Easy-Moderate',               'Higashi-ku, pleasant forest trails with city views at the summit', 'published'),
('mount-kaya',       'en', 'Moderate · Sea views',        'Itoshima peak with sweeping views of the sea and coastline', 'published'),
('sarakurayama',     'en', 'Cable car · Night views',     'Kitakyushu landmark with cable car access and one of Japan''s best night views', 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── Mountain / Hiking places — Japanese ──────────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('mount-homan',      'ja', '中級 · 人気が高い',       '大宰府近くで最も有名な山。整備された登山道と絶景', 'published'),
('mount-tenpaizan',  'ja', '初心者向け · 簡単',       '初心者に最適な低山。筑後平野の眺めが楽しめる', 'published'),
('mount-aburayama',  'ja', '初級〜中級 · 市内から近い', '福岡市街地から近く、家族でのハイキングに人気', 'published'),
('mount-sefuri',     'ja', '中級 · 美しい自然',       '福岡・佐賀県境に位置し、豊かな自然と絶景が魅力', 'published'),
('mount-raizan',     'ja', '中級 · 紅葉が美しい',     '糸島市の山。秋の紅葉スポットとして人気', 'published'),
('mount-tachibana',  'ja', '初級〜中級',               '東区にある山。気持ちよい森の登山道と市街地の眺望', 'published'),
('mount-kaya',       'ja', '中級 · 海の眺め',         '糸島の山。山頂から海岸線が一望できる', 'published'),
('sarakurayama',     'ja', 'ロープウェイあり · 夜景', '北九州市のシンボル。ロープウェイあり、日本三大夜景のひとつ', 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── Mountain / Hiking places — Korean ────────────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('mount-homan',      'ko', '보통 · 매우 인기',         '다자이후 근처에서 가장 유명한 산. 잘 정비된 등산로와 절경', 'published'),
('mount-tenpaizan',  'ko', '쉬움 · 초보자 적합',       '초보자에게 이상적인 완만한 산. 치쿠고 평야 전망', 'published'),
('mount-aburayama',  'ko', '쉬움~보통 · 시내 근처',    '후쿠오카 시내에서 가까워 가족 하이킹에 인기', 'published'),
('mount-sefuri',     'ko', '보통 · 아름다운 자연',     '후쿠오카·사가 경계에 위치, 아름다운 숲과 파노라마 전망', 'published'),
('mount-raizan',     'ko', '보통 · 단풍 명소',         '이토시마시의 산. 가을 단풍으로 유명한 명소', 'published'),
('mount-tachibana',  'ko', '쉬움~보통',                '히가시구에 위치. 쾌적한 숲길과 시내 전망', 'published'),
('mount-kaya',       'ko', '보통 · 바다 전망',         '이토시마 봉우리. 정상에서 해안선이 한눈에', 'published'),
('sarakurayama',     'ko', '케이블카 · 야경',          '기타큐슈의 랜드마크. 케이블카 탑승 가능, 일본 3대 야경 중 하나', 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

-- ── Mountain / Hiking places — Chinese ───────────────────────────────────────

INSERT INTO public.place_translations (place_slug, locale, area, short_description, translation_status) VALUES
('mount-homan',      'zh', '中级 · 非常受欢迎',        '大宰府附近最著名的山，登山道整备良好，景色绝佳', 'published'),
('mount-tenpaizan',  'zh', '简单 · 适合初学者',        '坡度平缓，适合初学者，可远眺筑后平原', 'published'),
('mount-aburayama',  'zh', '初级~中级 · 靠近市区',     '距福冈市区近，适合家庭徒步登山', 'published'),
('mount-sefuri',     'zh', '中级 · 自然风景优美',      '位于福冈与佐贺交界，森林茂密，全景绝佳', 'published'),
('mount-raizan',     'zh', '中级 · 红叶最美',          '糸岛市名山，以秋季红叶著称', 'published'),
('mount-tachibana',  'zh', '初级~中级',                '位于东区，林间步道宜人，山顶可俯瞰市区', 'published'),
('mount-kaya',       'zh', '中级 · 海景绝佳',          '糸岛山峰，山顶可眺望海岸线全景', 'published'),
('sarakurayama',     'zh', '缆车 · 夜景',              '北九州地标，设有缆车，日本三大夜景之一', 'published')
ON CONFLICT (place_slug, locale) DO NOTHING;

NOTIFY pgrst, 'reload schema';
