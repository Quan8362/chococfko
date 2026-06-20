-- ── SEARCH CONCEPTS (data-driven search taxonomy) ─────────────────────────────
-- Cho phép thêm category / alias đa ngôn ngữ / feature facet MỚI cho tìm kiếm địa
-- điểm mà KHÔNG cần sửa lib/placeSearch.ts & deploy. Engine merge các hàng này LÊN
-- cấu hình built-in (DEFAULT_SEARCH_CONFIG) qua lib/searchConcepts.ts.
--
-- AN TOÀN:
--   • Backward compatible: CREATE TABLE IF NOT EXISTS; không đụng dữ liệu cũ.
--   • Không xoá/sửa categories/tags/places hiện có.
--   • Nếu KHÔNG chạy migration này, search vẫn chạy bằng DEFAULT (gồm BBQ/camping/
--     picnic/nightlife + sửa substring) — loader tự fallback khi thiếu bảng.
--   • RLS: ai cũng ĐỌC được (search công khai); CHỈ service_role (Admin server
--     action) được GHI — user thường KHÔNG sửa được taxonomy.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.search_concepts;   -- (chỉ gỡ bảng; search về DEFAULT)

CREATE TABLE IF NOT EXISTS public.search_concepts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  type          text NOT NULL DEFAULT 'facet'
                  CHECK (type IN ('category','facet','tag','amenity','price','general')),
  enabled       boolean NOT NULL DEFAULT true,
  weight        integer NOT NULL DEFAULT 0,
  -- với type='category': mã category mà alias áp dụng (vd 'sea','camp').
  category_code text,
  -- {vi:'',en:'',ja:'',ko:'',zh:''} — tên hiển thị (Admin); KHÔNG ảnh hưởng matching.
  display_names jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {vi:[],en:[],ja:[],ko:[],zh:[]} — cụm KÍCH HOẠT khái niệm trong truy vấn.
  aliases       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {strong:{vi:[],…}, structured_flags:[]} — BẰNG CHỨNG cấp item cho feature facet.
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  matching_mode text NOT NULL DEFAULT 'boundary'
                  CHECK (matching_mode IN ('boundary','substring','exact')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- chống cấu hình rỗng/không an toàn ở mức DB (Admin UI kiểm tra thêm).
  CONSTRAINT search_concepts_key_not_blank CHECK (length(btrim(key)) > 0)
);

-- RLS: đọc công khai (search), ghi chỉ service_role.
ALTER TABLE public.search_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_concepts_public_read" ON public.search_concepts;
CREATE POLICY "search_concepts_public_read"
  ON public.search_concepts FOR SELECT
  USING (true);

-- Không tạo policy INSERT/UPDATE/DELETE cho anon/authenticated → mặc định BỊ TỪ CHỐI.
-- Admin server action dùng service role key (createAdminClient) → bypass RLS.

CREATE INDEX IF NOT EXISTS search_concepts_enabled_idx ON public.search_concepts (enabled);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION public.touch_search_concepts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_search_concepts ON public.search_concepts;
CREATE TRIGGER trg_touch_search_concepts
  BEFORE UPDATE ON public.search_concepts
  FOR EACH ROW EXECUTE FUNCTION public.touch_search_concepts_updated_at();

-- ── SEED: 4 feature facet hiện hữu (để Admin xem/sửa; idempotent, khớp DEFAULT) ──
-- Engine merge theo key nên seed trùng DEFAULT KHÔNG đổi hành vi; chỉ để hiển thị.
INSERT INTO public.search_concepts (key, type, enabled, display_names, aliases, evidence) VALUES
  ('bbq', 'facet', true,
   '{"vi":"BBQ","en":"BBQ","ja":"バーベキュー","ko":"바비큐","zh":"烧烤"}'::jsonb,
   '{"vi":["bbq","barbecue"],"en":["bbq","barbecue","barbeque","kbbq"],"ja":["バーベキュー"],"ko":["바비큐","바베큐"],"zh":["烧烤","烤肉"]}'::jsonb,
   '{"strong":{"vi":["bbq","barbecue"],"en":["bbq","barbecue","barbeque"],"ja":["バーベキュー"],"ko":["바비큐","바베큐"],"zh":["烧烤","烤肉"]},"structured_flags":["bbq_allowed","has_bbq"]}'::jsonb),
  ('camping', 'facet', true,
   '{"vi":"Cắm trại","en":"Camping","ja":"キャンプ","ko":"캠핑","zh":"露营"}'::jsonb,
   '{"vi":["camping","cam trai","cap trai"],"en":["camping","camp"],"ja":["キャンプ","キャンプ場"],"ko":["캠핑","캠프"],"zh":["露营","露營"]}'::jsonb,
   '{"strong":{"vi":["cam trai","cap trai"],"en":["camping"],"ja":["キャンプ"],"ko":["캠핑"],"zh":["露营","露營"]},"structured_flags":["camping_allowed","has_camping","can_camp"]}'::jsonb),
  ('picnic', 'facet', true,
   '{"vi":"Dã ngoại","en":"Picnic","ja":"ピクニック","ko":"피크닉","zh":"野餐"}'::jsonb,
   '{"vi":["picnic","da ngoai"],"en":["picnic"],"ja":["ピクニック"],"ko":["피크닉","소풍"],"zh":["野餐"]}'::jsonb,
   '{"strong":{"vi":["picnic","da ngoai"],"en":["picnic"],"ja":["ピクニック"],"ko":["피크닉","소풍"],"zh":["野餐"]},"structured_flags":["picnic_allowed","has_picnic"]}'::jsonb),
  ('nightlife', 'facet', true,
   '{"vi":"Vui chơi đêm","en":"Nightlife","ja":"ナイトライフ","ko":"나이트라이프","zh":"夜生活"}'::jsonb,
   '{"vi":["vui choi dem","di choi dem","choi dem"],"en":["nightlife","night life","bar","pub","club","nightclub"],"ja":["夜遊び","ナイトライフ","ナイトクラブ","クラブ"],"ko":["나이트라이프","나이트"],"zh":["夜生活","夜店","夜场","夜場","酒吧"]}'::jsonb,
   '{"strong":{"vi":["quan nhau","nhau"],"en":["nightlife","bar","pub","nightclub","izakaya","live house","livehouse"],"ja":["居酒屋","酒場","パブ","ナイトクラブ"],"ko":["술집"],"zh":["酒吧","夜店","夜场","夜場"]},"structured_flags":["nightlife","has_nightlife"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── PREVIEW trước khi áp dụng (chạy riêng để kiểm tra, không phá dữ liệu) ──
--   SELECT key, type, enabled, jsonb_object_keys(aliases) AS langs FROM public.search_concepts ORDER BY key;
