# Tournament Management System — Design & Architecture

> **Trạng thái:** Prompt 01–08 hoàn tất (local). Prompt 05 = Event & Competitor CRUD (§14); Prompt 06 = Chia bảng + drag-and-drop + generate vòng tròn (§15); Prompt 07 = Nhập tỉ số + BXH + qualification/phân định tie (§16); Prompt 08 = Knockout-only seeding + bracket + kết quả + podium (§17). Chưa push/deploy, chưa chạm production.
> **Ngày:** 2026-07-28
> **Phạm vi:** Module quản lý giải đấu độc lập cho Chợ Cóc FKO, ưu tiên cầu lông cộng đồng.
> **Nguyên tắc chung:** xem `PROMPT 00` — server-authoritative, RLS ở mọi bảng con, pure-function engine có unit test, migration không destructive, generation idempotent, không push/deploy đến phase cuối.

---

## 0. Quyết định kiến trúc (bắt buộc — chốt trước Prompt 02)

Hệ thống giải đấu **có thể được giới thiệu** trong trang Game mini, nhưng **KHÔNG** được triển khai như một mini game phụ thuộc vào Poker / Tiến Lên / Caro / các game khác.

1. **Module độc lập.** Repo hiện tại **không dùng `src/features`** — code chia theo `app/` (routes), `lib/` (domain + data), `components/` (UI dùng chung). Vì vậy "module độc lập" ánh xạ sang convention hiện có như sau:
   - Domain engine (pure TS + test): `lib/tournaments/` — **ngang hàng** với `lib/games/poker`, `lib/games/tlmn`, không nằm trong chúng.
   - Data access / server helpers: `lib/tournaments/*.ts` (server-tainted tách riêng nếu import `next/headers`, theo tiền lệ `lib/access.ts` vs `lib/access-server.ts`).
   - Routes public: `app/giai-dau/`.
   - Routes admin: `app/admin/giai-dau/`.
   - UI dùng chung của module: `components/tournaments/`.
   - Migrations: `web/supabase/migration_tournament_*.sql` (prefix riêng `tournament_`, **không** dùng prefix `caro_`/`poker_`).
2. **Route public ưu tiên:** `/giai-dau`, `/giai-dau/[slug]`.
3. **Route admin:** `/admin/giai-dau`, `/admin/giai-dau/new`, `/admin/giai-dau/[id]`, `/admin/giai-dau/[id]/edit`, `/admin/giai-dau/[id]/noi-dung/[eventId]`.
4. **Trang Game mini chỉ thêm entry point/card** dẫn tới `/giai-dau` — không nhúng domain engine, DB logic hay admin route của tournament vào bất kỳ mini game nào.
5. **Trang Game tách hai nhóm:**
   - **Trò chơi trực tuyến** (nhóm hiện tại: jp60, random wheel, caro, cờ tướng, tlmn, poker, …).
   - **Giải đấu & hoạt động cộng đồng** (card dẫn tới `/giai-dau`).
6. **Không** đặt tournament domain engine / DB logic / admin routes bên trong module của Poker, Tiến Lên, Caro hay mini game khác.
7. Repo **không có locale prefix** trên URL (next-intl dùng cookie, không path segment). Giữ nguyên convention: route tiếng Việt không prefix (`/giai-dau`, `/admin/giai-dau`). Tournament vẫn là module độc lập.
8. Audit trang Game / navigation / entry card — xem §7.

> **Lưu ý phân biệt với hệ thống sẵn có:** Repo đã có `caro_tournaments` (giải Cờ Caro, PvP online theo lượt) và `poker_tournament*` (giải Poker). Hai hệ này **gắn chặt vào engine game tương ứng** và **không tái sử dụng** cho module mới. Module "Giải đấu" (badminton-first) là **độc lập hoàn toàn**, người thi đấu là *competitor* nhập tay (không phải `auth.users`), kết quả nhập tay bởi Admin (không phát sinh từ engine chơi online).

---

## 1. Repository Audit

### 1.1 Nền tảng
| Hạng mục | Kết quả |
|---|---|
| Framework | Next.js **14.2.35**, **App Router** (`app/`) |
| Git root | `web/` (không phải repo root `d:\Projects\chococfko-web`); branch `main`, remote `Quan8362/chococfko` |
| Language | TypeScript strict (`tsconfig.json`) |
| Routing/locale | **Không** có locale segment. next-intl 4.x qua cookie; route path là tiếng Việt/anh không prefix |
| Styling | Tailwind + design tokens trong `globals.css` (`rose #c2185b`, `ink`, `muted`, `cream`, `paper`, `line`, `gold`, `teal`) |
| Baseline | `npx tsc --noEmit --skipLibCheck` → **EXIT 0** (repo xanh trước khi bắt đầu) |

### 1.2 Auth & xác định Admin
- Auth: Supabase Auth (`@supabase/ssr`), session refresh trong `middleware.ts` (không xoá cookie khi refresh lỗi — tránh bug logout).
- **Admin = allowlist email** qua env `ADMIN_EMAILS` (CSV). Kiểm tra ở `lib/supabase/admin.ts` → `checkIsAdmin()` (so `user.email` với danh sách). **KHÔNG** dùng cờ `admin=true` trong client metadata → an toàn, đúng yêu cầu Prompt.
- Toàn bộ cây `/admin/*` được gate một lần ở `app/admin/layout.tsx` (`checkIsAdmin()` → `redirect('/')`), **cộng** guard riêng ở từng action.
- Access tổng hợp: `lib/access-server.ts` → `getCurrentUserAccess()` trả `{ userId, isInternal, isAdmin }`; type thuần ở `lib/access.ts` (`UserAccess`, `ANON_ACCESS`).
- **Không có bảng `role`.** "Guest" theo Prompt = anon **hoặc** user đã đăng nhập nhưng không phải Admin → module xử lý cả hai như Guest (chỉ đọc).

### 1.3 Supabase clients (convention)
| Helper | Vai trò |
|---|---|
| `@/lib/supabase/server` → `createClient()` | Anon + cookie, tuân RLS. Dùng trong Server Components. |
| `@/lib/supabase/public` → `createPublicClient()` | Anon **không** cookie, an toàn trong `unstable_cache`. Dùng cho public reads. |
| `@/lib/supabase/admin` → `createAdminClient()` | **Service role, bypass RLS**. `import 'server-only'`. **Chỉ** trong `'use server'` actions. |
| `@/lib/supabase/client` | Browser client (realtime/subscriptions). |

### 1.4 Convention ghi dữ liệu (RẤT quan trọng)
Từ `migration_caro_tournament.sql`, mẫu đã được validate trong prod:
- **Mọi ghi dữ liệu admin đi qua service-role client** trong server action.
- RLS: `INSERT/UPDATE/DELETE` chỉ cấp `TO service_role`; `authenticated`/`anon` **không** có policy ghi (trừ hành động self-service như "join" — không áp dụng cho module này vì competitor nhập tay).
- Public read: `FOR SELECT USING (<điều kiện>)`.
- → Module Tournament áp dụng: **public SELECT chỉ khi tournament `status IN ('published','completed')`**; mọi ghi `TO service_role`; guard `checkIsAdmin()` trong action là hàng rào thật, RLS là hàng rào thứ hai (defense-in-depth).

### 1.5 Migrations
- **Không** có Supabase CLI local config trong repo (`supabase/config.toml` **không tồn tại**; không có thư mục `supabase/migrations/`). Migration là **file `.sql` rời** trong `web/supabase/`, chạy tay trong **Supabase SQL Editor**. Naming: `migration_<domain>_<feature>.sql`, có file `*_rollback.sql` và `*_tests.sql` đi kèm (xem bộ `poker_tournament_*`).
- Trigger dùng lại: `update_updated_at_column()` (đã tồn tại toàn cục).
- **Supabase local để test:** repo dùng WSL2 + Docker cho local stack (xem memory `wsl-supabase-e2e-stability`, `poker-local-validation`). Không có config commit sẵn → Prompt 02 sẽ cần dựng local stack thủ công hoặc test RLS bằng harness SQL như bộ `poker_tournament_*_tests.sql`.

### 1.6 Domain engine pattern (tiền lệ tốt để noi theo)
- `lib/games/tlmn/*.ts` + `*.test.ts` colocated; `lib/games/poker/` tương tự → **pure TS, không phụ thuộc Supabase**, chạy bằng `node --test`.
- Test runner: `node --test "lib/**/*.test.ts"` (script `npm test`). **Không** dùng vitest.
- → Engine tournament: `lib/tournaments/*.ts` pure + `*.test.ts` colocated, chạy `node --test`.

### 1.7 i18n
- 5 file phẳng `messages/{vi,en,ja,ko,zh}.json`, namespace top-level (`nav`, `games`, `admin`, `poker`, `tlmn`, …).
- Server: `getTranslations('ns')`; Client: `useTranslations('ns')`.
- Quy tắc zero-hardcode tuyệt đối (CLAUDE.md §6). Parity check: `npm run i18n:check` (`scripts/check-i18n-parity.mjs`).
- → Thêm namespace mới `tournaments` vào **cả 5 file** (Prompt 12 hoàn thiện; các phase trước thêm key ngay khi tạo UI).

### 1.8 UI dùng chung & navigation
- `components/Nav.tsx` (desktop ≥ xl) — dropdown "Giải trí" (`entertainment`) hiện chỉ có 1 item `mini_game` → `/games`. `components/MobileMenu.tsx` cho < xl.
- `components/NavDropdown.tsx`, `NavLink.tsx` tái sử dụng.
- Trang hub game: `app/games/page.tsx` — mảng `GAMES` render grid card; có sẵn placeholder "coming soon". Đây là nơi thêm nhóm "Giải đấu & hoạt động cộng đồng".
- Không có thư viện dialog/table/form riêng — UI ghép bằng Tailwind + component thủ công. `framer-motion` có sẵn cho animation nhẹ.
- Slug helper: `lib/tags.ts` có logic slugify (strip diacritics, fallback hashed) — tham khảo cho slug giải đấu.

### 1.9 Thư viện còn thiếu (candidate cho phase sau — chưa cài)
| Package | Mục đích | Đề xuất |
|---|---|---|
| `zod` | Validation schema dùng chung client+server | **Nên thêm** ở Prompt 02/04 (Prompt yêu cầu "schema validation ở cả client và server"). Repo chưa có validation lib → đây là bổ sung *cần thiết*, không phải thừa. |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Kéo-thả chia bảng / seed (Prompt 06, 08, 09) | **Nên thêm** ở Prompt 06, kèm phương án nút bấm thay thế cho a11y/touch. Prompt đã chỉ định đúng 2 package này. |

> Chỉ cài khi tới đúng phase cần, không cài trước. Không thêm form-library nặng (react-hook-form) — form thủ công + zod đủ dùng theo convention hiện tại.

### 1.10 Test framework hiện có
- Unit: `node --test` cho `lib/**/*.test.ts`.
- E2E: Playwright (`e2e/`, configs riêng cho poker/tlmn; `@playwright/test ^1.41.2` trong lockfile). Có `e2e/a11y.spec.ts`, `e2e/caro.spec.ts`.
- i18n parity: `scripts/check-i18n-parity.mjs`.
- Lint: `next lint` (full) + `lint:explore` (scoped). Typecheck: `tsc --noEmit --skipLibCheck`.

---

## 2. Kiến trúc đề xuất

```
web/
├── app/
│   ├── giai-dau/                         # PUBLIC (Guest)
│   │   ├── page.tsx                       # list published/completed
│   │   └── [slug]/
│   │       ├── page.tsx                   # detail: tabs tổng quan/VĐV/lịch/BXH/nhánh/thành tích
│   │       └── TournamentDetailClient.tsx # client tabs + realtime subscribe
│   └── admin/giai-dau/                    # ADMIN (đã được /admin/layout gate)
│       ├── page.tsx                        # list + filter status
│       ├── actions.ts                      # 'use server' — CRUD giải (service role + checkIsAdmin)
│       ├── new/page.tsx
│       └── [id]/
│           ├── page.tsx                    # dashboard giải
│           ├── edit/page.tsx
│           └── noi-dung/[eventId]/
│               ├── page.tsx                # setup 1 nội dung: VĐV, bảng, generate, nhập điểm
│               └── actions.ts              # 'use server' — event/competitor/generate/score
├── lib/
│   └── tournaments/                        # DOMAIN — pure TS + colocated *.test.ts
│       ├── types.ts                        # types & enums (status, format, bracket…)
│       ├── roundRobin.ts        (+ .test)  # generator vòng tròn
│       ├── standings.ts         (+ .test)  # tính BXH + tie detection
│       ├── qualification.ts     (+ .test)  # suất championship/consolation
│       ├── bracket.ts           (+ .test)  # generator knockout + BYE
│       ├── progression.ts       (+ .test)  # winner → slot vòng sau, tranh hạng ba
│       ├── podium.ts            (+ .test)  # thành tích từng nhánh
│       ├── validation.ts        (+ .test)  # zod schemas (dùng chung client/server)
│       ├── data.ts                         # server-tainted queries (đọc DB) — 'server-only'
│       └── access.ts                       # helper public-visibility (pure)
├── components/tournaments/                 # UI dùng chung module
│   ├── StatusBadge.tsx  StandingsTable.tsx  BracketView.tsx  ScoreEditor.tsx
│   ├── GroupDnDBoard.tsx  SeedEditor.tsx  EventFormFields.tsx  ...
└── supabase/
    ├── migration_tournament_core.sql (+ _rollback, _tests)
    └── ...
```

**Ranh giới quan trọng (theo tiền lệ `lib/access.ts` vs `access-server.ts`, `lib/places.ts`):**
- Pure engine (`roundRobin/standings/qualification/bracket/progression/podium/validation`) **không** import Supabase / `next/headers` → import được từ Client Components & test độc lập.
- `data.ts` gắn `'server-only'`, chỉ dùng trong Server Components/actions.

---

## 3. ERD (đề xuất — chi tiết hoá ở Prompt 02)

```
tournaments
  id, slug(unique), name, starts_at, ends_at, location, rules_url,
  status[draft|published|completed|archived], created_by, created_at, updated_at

tournament_events (1 tournament → N)
  id, tournament_id→tournaments, name, format[round_robin|knockout|group_knockout],
  group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group,
  third_place_enabled, status[setup|group_stage|group_stage_completed|
  knockout_ready|knockout_running|completed], display_order, version,
  created_at, updated_at

event_competitors (1 event → N)
  id, event_id→tournament_events, name, short_name, seed, display_order,
  created_at, updated_at

tournament_groups (1 event → N)
  id, event_id→tournament_events, name, display_order

group_memberships
  id, group_id→tournament_groups, competitor_id→event_competitors, display_order
  CONSTRAINT: competitor thuộc tối đa 1 group trong cùng event; competitor cùng event

matches
  id, event_id→tournament_events, group_id→tournament_groups(nullable),
  stage[group|knockout], bracket[null|championship|consolation],
  round_number, match_number,
  competitor_a→event_competitors(nullable), competitor_b→event_competitors(nullable),
  source_match_a→matches(nullable), source_match_b→matches(nullable),
  source_outcome_a[winner|loser|null], source_outcome_b[winner|loser|null],
  status[pending|ready|completed|bye|cancelled], winner_competitor_id(nullable),
  scheduled_at(nullable), generation_key(unique per event), created_at, updated_at

match_games (1 match → N game/set)
  id, match_id→matches, game_number, score_a, score_b
  CONSTRAINT: score >= 0; không hoà trong game completed

knockout_seed_slots
  id, event_id→tournament_events, bracket[championship|consolation],
  slot_index, source_type[competitor|group_rank|bye],
  source_group_id→tournament_groups(nullable), source_rank(nullable),
  competitor_id→event_competitors(nullable)
  CONSTRAINT: (bracket, source_group_id, source_rank) unique khi source_type=group_rank

qualification_overrides
  id, event_id, group_id, resolved_order(jsonb: [competitor_id...]),
  reason(nullable), created_by, created_at
  -- PRIVACY (migration 7, Prompt 14B): `reason` + `created_by` are internal. anon/authenticated have
  -- NO direct SELECT on this table; the public page reads only (group_id, resolved_order) via the
  -- SECURITY DEFINER RPC `tournament_public_qualification_overrides(event_id)`. reason/created_by never
  -- leave the server for a Guest (REST/RPC/Realtime). Admin/service-role read the full row as before.

podiums
  id, event_id, bracket[championship|consolation],
  rank[1|2|3], competitor_id, is_joint(bool)  -- đồng hạng 3

tournament_audit_log
  id, tournament_id, event_id(nullable), actor_id, action, detail(jsonb), created_at
```

Ràng buộc & index chính: xem §5 và Prompt 02/14.

---

## 4. Permission model

| Actor | Public list/detail | Admin routes/actions |
|---|---|---|
| Anon | Xem `published`+`completed` (RLS `SELECT`) | ❌ |
| Logged-in không phải Admin (**= Guest**) | Như anon | ❌ (layout redirect + action guard) |
| Admin (email ∈ `ADMIN_EMAILS`) | Xem tất cả (kể cả draft, qua service role trong admin route) | ✅ CRUD + generate + nhập điểm + publish + complete |

- **Ba lớp bảo vệ ghi:** (1) `app/admin/layout.tsx` gate cây `/admin`; (2) `checkIsAdmin()` đầu mỗi server action; (3) RLS chỉ cấp write `TO service_role`.
- Guest **không** gọi được server action ghi (action tự guard) và **không** ghi trực tiếp qua RLS.
- **Không** gửi Admin-only data (draft, override reason nội bộ nếu nhạy cảm) xuống client cho Guest.
- Chống IDOR: mọi action nhận `eventId`/`matchId` phải verify thuộc đúng `tournament_id` trước khi ghi (xem §5 invariants).

---

## 5. State machines & Invariants

### 5.1 Tournament status
`draft → published → completed → archived` (và `draft/published → archived`). Public chỉ thấy `published`, `completed`.

### 5.2 Event status
`setup → group_stage → group_stage_completed → knockout_ready → knockout_running → completed`
(với `round_robin`: `setup → group_stage → completed`; với `knockout`: `setup → knockout_running → completed`).

### 5.3 Match status
`pending → ready → completed`; `bye` (tự advance, không có điểm); `cancelled`.

### 5.4 Invariant bắt buộc (được test)
1. **Vòng tròn:** mỗi cặp gặp đúng 1 lần, không self-match; số trận bảng `n` = `n·(n−1)/2`; generation deterministic + có `generation_key` → **idempotent**.
2. **BXH:** thắng 1đ / thua 0đ, không hoà; sắp xếp `tablePoints ↓ → pointDifference ↓ → pointsFor ↓`; nếu vẫn bằng → **tied**, KHÔNG dùng tên/seed làm tiêu chí thể thao.
3. **Qualification:** championship lấy top `winner_qualifiers_per_group`, consolation lấy các hạng kế tiếp `consolation_qualifiers_per_group`; **không** competitor nào ở cả 2 nhánh; thiếu người → validation error; tie ở ranh giới → chặn generate, chờ Admin override.
4. **Nhánh thắng vs nhánh thua:** `championship` = nhánh thắng, `consolation` = nhánh thua. **KHÔNG double-elimination** — người thua ở championship **không** rơi xuống consolation. Consolation là knockout độc lập lấy từ hạng kế tiếp vòng bảng. Sau khi bắt đầu, 2 nhánh **không** trao đổi competitor.
5. **Knockout:** bracket size = power-of-two gần nhất ≥ số VĐV; BYE tự advance (không tính là trận có điểm); winner tiến đúng slot; loser bán kết → tranh hạng ba (nếu bật).
6. **Podium:** có tranh hạng ba → 3 = winner trận đó; không có → 2 loser bán kết đồng hạng ba. Áp dụng riêng từng nhánh.
7. **Score:** điểm ≥ 0, game completed không hoà; winner suy ra từ số game thắng; `points_for` = tổng điểm mọi game.
8. **Chống IDOR:** action verify `matchId → event_id → tournament_id` khớp trước khi ghi; không cho sửa competitor/match của event/tournament khác.
9. **Concurrency:** cập nhật score dùng optimistic (version/`updated_at`) → phát hiện xung đột, không âm thầm ghi đè.
10. **Sửa upstream knockout:** downstream chưa completed → cập nhật participant; downstream đã completed → **chặn**, yêu cầu `resetAffectedKnockoutPath` có xác nhận `RESET`, chỉ reset đúng dependency path.

---

## 6. Migrations plan (Prompt 02)

Theo naming `migration_tournament_*.sql` + `_rollback.sql` + `_tests.sql`, chạy trong Supabase SQL Editor. Không destructive.

1. `migration_tournament_core.sql` — 3 bảng gốc: `tournaments`, `tournament_events`, `event_competitors` + trigger `updated_at` + RLS + index.
2. `migration_tournament_groups_matches.sql` — `tournament_groups`, `group_memberships`, `matches`, `match_games` + constraint + index + RLS.
3. `migration_tournament_knockout.sql` — `knockout_seed_slots`, `qualification_overrides`, `podiums` + RLS.
4. `migration_tournament_audit.sql` — `tournament_audit_log` + RLS (chỉ service_role đọc/ghi; không expose Guest).
5. Mỗi file kèm `*_rollback.sql` và `*_tests.sql` (assert: anon không ghi, anon không đọc draft, admin CRUD).

Index tối thiểu: `tournaments(slug)` unique, `tournaments(status, starts_at)`, `tournament_events(tournament_id, display_order)`, `event_competitors(event_id)`, `matches(event_id)`, `matches(group_id)`, `matches(event_id, bracket, round_number, match_number)`, `matches(generation_key)` unique, `match_games(match_id)`.

---

## 7. Games hub & Navigation — kế hoạch entry point (Prompt 04/10)

- **`app/games/page.tsx`:** tách render thành 2 section có heading:
  - **"Trò chơi trực tuyến"** — giữ nguyên mảng `GAMES` hiện tại.
  - **"Giải đấu & hoạt động cộng đồng"** — 1 card mới dẫn `/giai-dau` (icon cúp/huy chương, tone riêng). Không phá layout/card hiện có.
- **`components/Nav.tsx`:** thêm item vào dropdown `entertainment` (hoặc dropdown mới) → `{ href: '/giai-dau', label: t('nav.tournaments'), icon: 'trophy' }`. `components/MobileMenu.tsx` thêm mục tương ứng.
- Không đổi cấu trúc Nav/menu ngoài việc thêm 1 entry. Key i18n `nav.tournaments` + namespace `tournaments` thêm vào cả 5 file.
- Entry point là **điểm khám phá**; không nhúng logic tournament vào game nào.

---

## 8. Test plan (tổng quan — chi tiết ở Prompt 03 & 13)

- **Unit (`node --test`, colocated):** roundRobin (2/3/4/5 người, nhiều bảng, lẻ→bye), standings (từng tiêu chí phụ + tie), qualification (1+2 và 2+2, không trùng nhánh, thiếu người, tie chặn), bracket (2/4/6-bye/8/10-bye), progression (đa vòng, tranh hạng ba), podium (có/không tranh hạng ba, từng nhánh).
- **DB/RLS (SQL harness kiểu `*_tests.sql`):** anon đọc published/completed, không đọc draft, không ghi; admin CRUD.
- **Integration:** Scenario A round-robin, B knockout, C group+knockout 4 bảng, D qualification 2+2, E tie→override, F score correction reset.
- **Playwright E2E (Supabase local, không chạm prod):** Guest xem, Guest không thấy nút edit, Guest chặn admin; Admin tạo giải/nội dung/VĐV/chia bảng/generate/nhập điểm; Guest thấy realtime update; bracket & podium đúng; responsive desktop/tablet/mobile.
- **Quality gate mỗi phase:** `npm run typecheck`, `npm run lint`, test liên quan, `npm run i18n:check`, `npm run build` (phase cuối).

---

## 9. Rủi ro kỹ thuật

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Không có Supabase local config commit sẵn | Khó chạy RLS/E2E local | Dùng WSL2+Docker (tiền lệ poker); viết SQL test harness độc lập; document cách dựng ở Prompt 14 |
| Vercel Hobby image quota đã vượt (memory) | Không liên quan trực tiếp nhưng deploy đang nhạy cảm | Module không thêm ảnh nặng; entry card dùng SVG inline như hub hiện tại |
| Kéo-thả trên touch + a11y | Chia bảng/seed khó dùng mobile | `@dnd-kit` + **luôn** có nút "chuyển bảng"/di chuyển thay thế (Prompt 06/12) |
| Cascade reset knockout | Sai sót xoá nhầm nhánh | Dependency-graph rõ; chặn tự cascade; xác nhận `RESET`; audit log chi tiết (Prompt 11) |
| Tie hoàn toàn ở ranh giới suất | Sinh bracket sai | Chặn generate + override thủ công có audit; hiển thị "BTC phân định" cho Guest (Prompt 07/09) |
| i18n 5 ngôn ngữ × nhiều key | Missing key hiện raw trên UI | Thêm cả 5 file cùng lúc; `npm run i18n:check` mỗi phase |
| Optimistic concurrency 2 admin | Ghi đè âm thầm | version/`updated_at` compare + thông báo reload (Prompt 11) |

---

## 10. Package cần thêm (khi tới phase) — tóm tắt

- `zod` (Prompt 02/04) — validation dùng chung client+server. *Cần thiết.*
- `@dnd-kit/core`, `@dnd-kit/sortable` (Prompt 06) — kéo-thả chia bảng/seed + fallback nút bấm. *Cần thiết cho UX chia bảng.*

Không cài package nào khác. Chưa cài trong Prompt 01.

---

## 11. Baseline đã xác nhận (Prompt 01)

- `npx tsc --noEmit --skipLibCheck` → **EXIT 0**.
- Không sửa code trong phase này (chỉ tạo tài liệu này).
- Chưa tạo migration, chưa tạo route/UI.

**Kết thúc Prompt 01. Dừng lại chờ duyệt trước khi sang Prompt 02.**

---

## 12. Prompt 02 — Database đã triển khai (schema thực tế)

> Files: `web/supabase/migration_tournament_core.sql`, `..._core_rollback.sql`, `tournament_core_tests.sql`.
> **Trạng thái thực thi:** áp dụng + test trên **Supabase local (WSL2 Docker, container `supabase_db_*`)** — **KHÔNG** chạm production. Xem §12.6.

### 12.1 Bảng thực tế (11 bảng, đều prefix `tournament`)
`tournaments` · `tournament_events` · `tournament_competitors` · `tournament_groups` · `tournament_group_memberships` · `tournament_matches` · `tournament_match_games` · `tournament_knockout_seed_slots` · `tournament_qualification_overrides` · `tournament_podium` · `tournament_audit_log`.

### 12.2 Cross-event integrity qua COMPOSITE FOREIGN KEY (quyết định kỹ thuật)
**Chọn composite FK thay vì trigger** vì nó bất biến ở tầng storage, không thể bỏ qua, không cần bảo trì code, và chi phí bằng FK thường. Cách làm:
- Mỗi cha có UNIQUE phụ `(id, event_id)`: `tournament_events(id, tournament_id)`, `tournament_competitors(id, event_id)`, `tournament_groups(id, event_id)`, `tournament_matches(id, event_id)`.
- Con mang thêm `event_id` (denormalized) và tham chiếu composite:
  - `tournament_group_memberships (group_id, event_id) → groups`, `(competitor_id, event_id) → competitors` → group & competitor **buộc cùng event**.
  - `tournament_matches (group_id,event_id)→groups`, `(competitor_a_id,event_id)/(competitor_b_id,event_id)→competitors`, `(source_match_*,event_id)→matches (self)`.
  - `tournament_knockout_seed_slots (source_group_id,event_id)→groups`, `(competitor_id,event_id)→competitors`.
  - `tournament_qualification_overrides (group_id,event_id)→groups`; `tournament_podium (competitor_id,event_id)→competitors`.
- Cột nullable (placeholder) dùng **MATCH SIMPLE** (mặc định): khi cột NULL, FK bỏ qua → hỗ trợ **participant chưa xác định** ở vòng knockout sau (competitor_a/b_id NULL) và match vòng bảng không có bracket.
- **Đã test:** 4 phép chèn cross-event (A-competitor→B-group, A-competitor→B-match, A-group→B-match, B-slot→A-group) đều bị FK từ chối.

### 12.3 Constraints chính
- **Unique:** `tournaments.slug`; `tournament_groups(event_id,name)`; `tournament_group_memberships(event_id,competitor_id)` (1 competitor ≤ 1 bảng/event); `tournament_matches(event_id,generation_key)` (idempotent generate); `tournament_match_games(match_id,game_number)`; `tournament_knockout_seed_slots(event_id,bracket,slot_index)`; partial unique `(event_id,bracket,source_group_id,source_rank) WHERE source_type='group_rank'` (không dùng 1 group-rank 2 lần/branch); `tournament_podium(event_id,bracket,competitor_id)` + partial unique `(event_id,bracket,rank) WHERE rank IN (1,2)` (rank 3 lặp được cho **đồng hạng ba**).
- **Check:** name/slug not empty; `ends_at ≥ starts_at`; status/format/stage/bracket enums; `group_knockout ⇒ winner_qualifiers ≥ 1` & `group_count ≥ 1`; `round_robin ⇒ group_count ≥ 1`; score ≥ 0; **game `score_a ≠ score_b`** (mọi game đã ghi phải có người thắng); `stage='group' ⇒ bracket NULL & group_id NOT NULL`; `stage='knockout' ⇒ bracket NOT NULL & group_id NULL`; **BYE** = `num_nonnulls(a,b)=1` & có winner (KHÔNG dùng 0–0); winner ∈ {a,b}; seed-slot shape theo `source_type`.
- **Optimistic concurrency:** cột `version` trên `tournament_matches` & `tournament_events` + trigger `tournament_bump_version()` (BEFORE UPDATE, `NEW.version = OLD.version+1`). App update `WHERE id=? AND version=?`; 0 row = admin khác đã sửa. Đã test: guarded update khớp, version tăng 1→2, stale-version update = 0 row.

### 12.4 Indexes
`tournaments(status,starts_at DESC)`, `tournament_events(tournament_id,display_order)`, `tournament_competitors(event_id,display_order)`, `tournament_groups(event_id,display_order)`, `tournament_group_memberships(group_id,display_order)`, `tournament_matches(event_id)`, `(group_id)`, `(event_id,bracket,round_number,match_number)`, `tournament_match_games(match_id,game_number)`, `tournament_knockout_seed_slots(event_id,bracket,slot_index)`, `tournament_qualification_overrides(event_id)`, `tournament_podium(event_id,bracket,rank)`, `tournament_audit_log(tournament_id,created_at DESC)`. (Các UNIQUE ở trên tự tạo index kèm.)

### 12.5 RLS & service-role security model
- **21 policy.** Mỗi bảng (trừ audit): `<t>_public_select` FOR SELECT + `<t>_service_all` FOR ALL TO service_role. `tournament_audit_log`: **chỉ** `tal_service_all` (không có public select → mặc định deny).
- **Guest gating qua SECURITY DEFINER helpers** (`tournament_is_public`, `tournament_event_is_public`, `tournament_match_is_public`) → child chỉ SELECT được khi tournament liên kết ở `published`/`completed`. Query trực tiếp bảng con **không** lộ dữ liệu draft (đã test R7).
- **Service-role model:** repo ghi dữ liệu qua `createAdminClient()` (service_role) trong `'use server'` actions, **sau** `checkIsAdmin()`. Service_role **không** bypass RLS ở đây (giống caro/poker) → có policy `FOR ALL TO service_role` tường minh + `GRANT ALL … TO service_role`.
- **Defense-in-depth:** `REVOKE INSERT,UPDATE,DELETE,TRUNCATE … FROM anon, authenticated` (và `REVOKE ALL` trên audit_log) → Guest **không thể** ghi kể cả khi một policy tương lai cấu hình sai. Đã test: anon INSERT bị `insufficient_privilege` (RLS WITH CHECK), anon/authenticated UPDATE/DELETE & đọc audit bị `permission denied`.
- Guest = anon **và** authenticated-non-admin: đã test cả hai role thấy y hệt (không thấy draft, không đọc audit, không ghi).

### 12.6 Trạng thái thực thi (đã chạy — chỉ LOCAL)
| Bước | Kết quả |
|---|---|
| Áp dụng migration (local, fresh) | ✅ EXIT 0 |
| Áp dụng lại (idempotency) | ✅ EXIT 0 |
| Rollback → apply → apply → tests (full cycle) | ✅ tất cả EXIT 0 |
| `tournament_core_tests.sql` (BEGIN…ROLLBACK, không persist) | ✅ **ALL ASSERTIONS PASSED** |
| Kết quả schema | 11 bảng, 21 policy |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| **Supabase production** | ❌ **CHƯA chạy** (chờ review — chạy tay trong SQL Editor) |

**Ghi chú self-contained:** local stack không có `public.update_updated_at_column()` (chỉ có bản của schema `storage`). Migration tự tạo bản `public` **nếu chưa tồn tại** → an toàn cả trên prod (đã có) lẫn DB sạch. Chưa thêm bảng vào `supabase_realtime` publication (để dành Prompt 11). Chưa cài `zod`/`@dnd-kit` (đúng phase database).

**Kết thúc Prompt 02. Dừng lại chờ review trước khi áp dụng SQL trên production và trước Prompt 03.**

---

## 13. Prompt 03 — Domain engine (pure TypeScript)

> Vị trí: `web/lib/tournaments/domain/` — **ngang hàng**, không trộn với `lib/games/*`. Test colocated `*.test.ts`, chạy `node --test` (Node v24, native TS strip; import sibling **kèm đuôi `.ts`**). Không package mới. Không `any`. Không mutate input. Deterministic.

### 13.1 Module & contract
| Module | Export chính | Contract |
|---|---|---|
| `types.ts` | các type & enum | Data shapes thuần, mirror schema Prompt-02 nhưng **không** phụ thuộc Supabase generated types. |
| `errors.ts` | `TournamentDomainError`, `TournamentErrorCode`, `isTournamentDomainError` | Mọi lỗi mang **code máy** ổn định (không throw chuỗi chung chung). |
| `outcome.ts` | `deriveMatchOutcome(match) → {winnerId, loserId, gamesWon*, pointsFor*}` | Validate + suy winner từ số game thắng. Throw: `MISSING_SCORE`, `TIED_GAME_SCORE`, `INDECISIVE_MATCH`, `WINNER_MISMATCH`, `SELF_MATCH`. |
| `round-robin.ts` | `generateRoundRobin({groupId, competitors}) → GeneratedGroupMatch[]` | Circle method; mỗi cặp 1 lần; tổng `n(n−1)/2`; `<2`→`[]`; dup→`DUPLICATE_COMPETITOR`. |
| `standings.ts` | `calculateStandings({competitors, matches}) → Standings` | Chỉ `completed`; win=1/loss=0; sort `tablePoints↓→pointDifference↓→pointsFor↓`; tie → shared rank + `tieGroups`. |
| `ties.ts` | `classifyTies(...) → ClassifiedTie[]`, `hasBlockingTie` | Gắn `impact` cho từng tie group. |
| `qualification.ts` | `qualifyGroup(...) → QualificationOutcome` | `ok` / `blocked_by_tie` / `invalid`. Nhận `resolvedOrder` (override) để phá tie — **không** ghi DB. |
| `knockout.ts` | `generateKnockout({bracket, entrants, thirdPlaceEnabled}) → KnockoutBracket`; type `KnockoutEntrant` | Bracket power-of-two; auto-BYE; placeholder; third-place. |
| `progression.ts` | `progressKnockout(...) → ProgressionResult` | Trả **patch mô tả** (matchKey, slot A/B, competitorId) — **không** ghi DB, **không** mutate bracket. |
| `podium.ts` | `calculatePodium(input) → PodiumResult` | Per-bracket độc lập; `ready` / `pending`. |
| `index.ts` | barrel | Re-export toàn bộ. |

### 13.2 Invariants (được test — 78 test)
- **Round-robin:** mỗi cặp đúng 1 lần, không self, không đảo chiều trùng (generationKey từ cặp đã sort → reversal-proof), tổng `n(n−1)/2`, mỗi người đánh `n−1` trận, số lẻ → 1 người nghỉ mỗi vòng **không** sinh match-vs-BYE, deterministic, không mutate.
- **Standings:** chỉ completed (pending/ready/bye/cancelled bỏ qua); pointsFor/Against = tổng điểm mọi game; thứ tự 3 tầng; ID/seed/roster-index **chỉ** để deterministic kỹ thuật, tie vẫn shared-rank + `tied`.
- **Qualification A/B (bắt buộc):** champ=1,conso=2 → champ `[1]`, conso `[2,3]`; champ=2,conso=2 → champ `[1,2]`, conso `[3,4]`; không competitor ở cả 2 nhánh; overflow → `invalid`.
- **Knockout sizes:** 2→2(0 bye), 3→4(1), 4→4(0), 5→8(3), 6→8(2), 8→8(0), 10→16(6), 16→16(0); tổng main-match = size−1; số bye-match vòng 1 = byes; **không** 2 bye gặp nhau.

### 13.3 Tie behavior
`classifyTies` gắn `impact` cho mỗi tie group theo vị trí (ordinal positions) so với các "cut":
- `group_knockout`: `championship_boundary` (straddle cut = winnerQ), `consolation_boundary` (straddle cut = winnerQ+consolationQ), hoặc `none`.
- `round_robin`: `podium` nếu tie chạm top `podiumSize` (mặc định 3), ngược lại `none`.
- `qualifyGroup` **block** khi có tie `impact≠none` và không có `resolvedOrder`. Admin cung cấp `resolvedOrder` (Prompt 07/09) → phá tie, trả `ok`. Đây là input của pure function; ghi DB + audit để phase sau.

### 13.4 BYE behavior
- BYE là **slot kind** (`{from:'bye'}`) trong bracket, **không bao giờ** là score 0–0.
- Auto-add: `byes = size − entrants`; seeding chuẩn đặt BYE đấu với hạt giống trên → `byes < size/2` nên **không** có 2 BYE gặp nhau.
- Match có đúng 1 slot BYE → `isBye=true`, entrant còn lại auto-advance; **không** tính là trận thắng có điểm; **không** tạo competitor giả trong danh sách entrants.

### 13.5 Progression behavior
- `progressKnockout` nhận match completed + winnerId/loserId, tìm downstream slot tham chiếu `{from:'winner'|'loser', matchKey}` và trả **patches** `{matchKey, slot:'A'|'B', competitorId}`.
- Winner → slot vòng sau; loser bán kết → third-place (nếu có). Final xong → không patch. BYE → route winner, `loserId=null` (không patch loser). Match lạ → `UNKNOWN_MATCH`. **Không** mutate, **không** ghi DB (patch để server action áp dụng ở Prompt 08/11).

### 13.6 Kết quả & schema compatibility
- **Test:** 78/78 pass (`node --test`). `tsc --noEmit --skipLibCheck` EXIT 0. `next lint --dir lib` EXIT 0 (không warning trong `lib/tournaments`).
- **Không phát hiện schema blocker (Prompt #23).** Các type map thẳng vào schema Prompt-02: `GeneratedGroupMatch.generationKey`→`tournament_matches.generation_key`; `SlotSource`→`tournament_knockout_seed_slots(source_type/source_group_id/source_rank/competitor_id)`; `KnockoutSlot.from='winner'|'loser'`→`source_match_*`+`source_outcome_*`; `PodiumEntry`→`tournament_podium(rank,is_joint)`. **Không** sửa migration Prompt-02.

**Kết thúc Prompt 03. Dừng lại, không tự sang Prompt 04.**

---

## 14. Prompt 05 — Event & Competitor CRUD (Admin)

> **Trạng thái:** triển khai + kiểm thử **local** (Supabase WSL Docker `supabase_db_*`) — **KHÔNG** chạm production, **KHÔNG** push/deploy.
> **Nguyên tắc:** module Tournament vẫn độc lập; mọi mutation theo thứ tự authenticate → `checkIsAdmin()` → validate → verify ownership/concurrency → service-role write → audit → revalidate → typed result.

### 14.1 Files tạo/sửa
- **Validation (pure, client-safe, no I/O):** `lib/tournaments/eventValidation.ts` (+ `.test.ts`), `lib/tournaments/competitorValidation.ts` (+ `.test.ts`). Không import `.ts`-suffix engine (tránh lỗi bundler). Mirror CHECK constraints Prompt-02 + áp **format-conditional normalization**.
- **Types:** mở rộng `lib/tournaments/admin/types.ts` (`EventStatus`, `EventListItem`, `CompetitorRow`, `EventDetail`, `EventMutationError`, `EventMutationResult`, `CompetitorMutationResult`, `BulkMutationResult`).
- **Queries (server-only):** mở rộng `lib/tournaments/admin/queries.ts` — `listEventsForAdmin` (embed `tournament_competitors(count)`, **1 query, no N+1**), `getEventForAdmin` (verify event↔tournament, đếm match/completed, roster).
- **Actions:** `app/admin/giai-dau/[id]/noi-dung/actions.ts` (`'use server'`) — 4 event + 5 competitor actions.
- **Client components:** `components/tournaments/admin/EventForm.tsx`, `EventList.tsx`, `CompetitorManager.tsx`, `EventStatusBadge.tsx` (dùng lại `ConfirmDialog`).
- **Routes:** `app/admin/giai-dau/[id]/noi-dung/new/page.tsx`, `.../[eventId]/page.tsx`, `.../[eventId]/edit/page.tsx`; cập nhật `app/admin/giai-dau/[id]/page.tsx` (nhúng `EventList`).
- **i18n:** 2 namespace mới × 5 locale — `admin_tournament_events` (83 key), `admin_tournament_competitors` (46 key). Parity OK (6075 key × 5).
- **Tests:** `lib/tournaments/admin/eventSecurity.test.ts` (12 structural), `supabase/tournament_events_tests.sql` (RLS/constraint/concurrency harness).

### 14.2 Event CRUD & conditional settings
Trường: `name`, `format` (`round_robin|knockout|group_knockout`), `group_count`, `winner_qualifiers_per_group`, `consolation_qualifiers_per_group`, `third_place_enabled`, `display_order`. Event mới **luôn** `status='setup'` (server hardcode; **không** nhận status từ client).
- **round_robin:** hiện *số bảng*; reset qualifiers=0, third-place=false; validate `group_count ≥ 1`.
- **knockout:** hiện *tranh hạng ba*; neutralize `group_count=1`, qualifiers=0.
- **group_knockout:** hiện *số bảng / suất nhánh thắng / suất nhánh thua / tranh hạng ba*; validate `group_count ≥ 1`, `winner ≥ 1`, `consolation ≥ 0`. UI giải thích: nhánh thắng=championship, nhánh thua=consolation (knockout độc lập từ hạng vòng bảng, **không** double-elimination, đội thua championship **không** rơi xuống consolation).

### 14.3 Quy tắc sửa/xoá & concurrency
- **Concurrency:** event dùng cột `version` (trigger `tournament_bump_version`), guard `WHERE id=? AND version=?`; competitor dùng `updated_at` (trigger `update_updated_at_column`), guard `WHERE id=? AND updated_at=?`. Token luôn lấy từ server, không tin client.
- **Sửa event:** đổi format/structural setting bị chặn nếu đã có match → `event_needs_reset`; đã có match completed → `event_has_results` (reset là phase sau, **chưa** xây ở Prompt 05). Đổi mỗi `name` luôn cho phép.
- **Xoá event:** chặn khi có match completed (`event_has_results`) hoặc có match bất kỳ (`event_needs_reset`); chỉ xoá khi 0 match. Audit `event_deleted` ghi `event_id=NULL` (audit event_id FK ON DELETE SET NULL) + giữ id trong `detail`.
- **Competitor:** thêm/sửa/xoá/reorder bị khoá khi event đã có match (`event_locked`) — roster đóng băng sau generate. Xoá competitor: có match completed → `competitor_has_results`; được match pending/ready hoặc group membership tham chiếu → `competitor_needs_reset`. DB backstop: `tournament_matches → competitor` FK **ON DELETE NO ACTION**.

### 14.4 Bulk add
Textarea mỗi dòng 1 competitor. `parseBulkCompetitors` (pure, dùng chung client preview + server): trim, bỏ dòng rỗng, collapse whitespace, dedup **case/space-insensitive**, limit `BULK_MAX_LINES=256`. **All-or-nothing:** phát hiện trùng trong input (`bulk_duplicate_input`) hoặc trùng roster (`bulk_duplicate_existing`) → từ chối cả lô, ghi 0 dòng; insert cả mảng trong 1 câu lệnh (không để trạng thái thêm một phần). Duplicate là guard **application-layer** (schema **không** có `UNIQUE(event_id,name)` — xem §14.7).

### 14.5 Anti-IDOR & permission
Mọi action: `checkIsAdmin()` trước service-role; `loadEvent()` chứng minh event↔tournament; competitor verify `event_id===eventId`; reorder verify payload là **permutation** đúng tập id của parent (không chèn id lạ). Client component **không** import service-role/queries (kiểm bằng structural test). Audit metadata **không** chứa token/cookie/session/secret.

### 14.6 Audit actions
`event_created`, `event_updated`, `event_deleted`, `events_reordered`, `competitor_created`, `competitor_updated`, `competitor_deleted`, `competitors_bulk_created`, `competitors_reordered`.

### 14.7 Publish & CTA bước sau
- **Publish:** dùng `publishTournament` (Prompt 04) — yêu cầu `≥1 event`, **không** yêu cầu event có competitor (đúng business rule hiện tại; không tạo dữ liệu giả).
- **CTA bước sau (disabled):** event detail hiện nút *Chia bảng* (round_robin/group_knockout, Prompt 06) hoặc *Xếp nhánh đấu* (knockout, Prompt 08) — disabled + "Sắp có", **không** tạo route 404.

### 14.8 Kết quả kiểm thử (local)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **131/131** (95 cũ + 24 validation + 12 structural) |
| SQL harness `tournament_events_tests.sql` (BEGIN…ROLLBACK) | ✅ **ALL … PASSED** trên local DB |
| Regression `tournament_core_tests.sql` + `tournament_admin_tests.sql` | ✅ PASSED |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (lib/components/app admin giai-dau) | ✅ 0 warning trong file tournament |
| `npm run i18n:check` | ✅ 6075 key × 5 locale |
| `next build` | ✅ EXIT 0 (7 route `/admin/giai-dau*`) |
| Secret scan file mới | ✅ sạch (chỉ comment "NEVER secrets") |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 14.9 Schema note (không phải blocker)
Schema Prompt-02 **không** có `UNIQUE(tournament_competitors.event_id, name)`. Không âm thầm sửa migration Prompt-02. Duplicate được chặn ở **application layer** (case/space-insensitive) cho create/update/bulk. *Đề xuất phase sau (tuỳ chọn):* nếu muốn hàng rào DB, thêm migration bổ sung `CREATE UNIQUE INDEX ... ON tournament_competitors (event_id, lower(btrim(name)))` — **không** thực hiện ở Prompt 05.

### 14.10 Để lại cho Prompt 06+
Chia bảng (drag-and-drop `@dnd-kit` chưa cài), generate round-robin/knockout, seed bracket, nhập tỉ số, standings, qualification/override, bracket UI, public page, realtime, reset-generation (khi format/roster đổi sau khi đã có match). Reorder ở Prompt 05 dùng **nút ↑/↓** (chưa drag-and-drop).

**Kết thúc Prompt 05. Dừng lại, không tự sang Prompt 06. Không push/deploy.**

---

## 15. Prompt 06 — Chia bảng, drag-and-drop & generate vòng tròn (round_robin + group_knockout)

> **Trạng thái:** triển khai + kiểm thử **local** (Supabase WSL Docker `supabase_db_*`) — **KHÔNG** chạm production, **KHÔNG** push/deploy. Chỉ áp dụng cho `round_robin` và `group_knockout`; `knockout` vẫn hiện CTA disabled *Xếp nhánh đấu — Prompt 08*.

### 15.1 Files tạo/sửa
- **Domain (pure, colocated `.test.ts`, `node --test`):**
  - `lib/tournaments/domain/group-assignment.ts` — `validateAssignmentPayload` (permutation của competitor trên groups), `evaluateReadiness` (§8 pre-generate: unassigned / empty / <2 / thiếu qualifier capacity), `requiredGroupSize`, `groupLetters` (A..Z, AA.. bijective base-26).
  - `lib/tournaments/domain/group-board.ts` — mô hình board thuần dùng CHUNG cho drag-and-drop và nút a11y: `buildBoardState`, `findContainer`, `moveItem`, `shiftContainer`, `nudgeWithin`, `toAssignmentPayload`. Đảm bảo drag == keyboard == nút bấm cho ra **cùng payload**.
  - `lib/tournaments/domain/group-preview.ts` — `buildRoundRobinPreview` + `buildRoundRobinMatches` gọi **trực tiếp** `generateRoundRobin` (KHÔNG viết lại thuật toán); nhóm match theo round.
  - `+ 3 file test` (group-assignment 18, group-board 9, group-preview 6 = 33 test mới) và barrel `domain/index.ts` re-export.
- **Types:** mở rộng `lib/tournaments/admin/types.ts` — `GroupRow`, `ScheduleMatch`, `GroupSetup`, `GroupMutationError`, `GroupMutationResult`.
- **Queries (server-only):** `getGroupSetupForAdmin` trong `lib/tournaments/admin/queries.ts` — 1 chỗ nạp event(settings)+competitors+groups+memberships(→ ordered + unassigned)+schedule+ hasScores/hasKnockout; verify event↔tournament; trả null cho knockout.
- **Actions:** 4 action mới trong `app/admin/giai-dau/[id]/noi-dung/actions.ts` — `initializeTournamentGroups`, `saveGroupAssignments`, `generateGroupMatches`, `regenerateGroupMatches` (tái dùng `loadEvent`/`writeAudit`/`currentUserId`/revalidate của Prompt 05).
- **Migration:** `supabase/migration_tournament_group_assignment.sql` (+ `_rollback.sql`, `tournament_group_assignment_tests.sql`) — **chỉ CREATE FUNCTION**, KHÔNG sửa schema Prompt-02.
- **UI (client):** `components/tournaments/admin/GroupAssignmentBoard.tsx` (dnd-kit + a11y), `RoundRobinPreviewPanel.tsx`, `GroupScheduleView.tsx`, `EventWorkspace.tsx` (tabs). `app/admin/giai-dau/[id]/noi-dung/[eventId]/page.tsx` nhúng `EventWorkspace` + summary.
- **Packages:** cài `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (đúng Prompt 06; không cài thư viện drag khác).
- **i18n:** 4 namespace mới × 5 locale — `admin_tournament_groups`, `admin_group_assignment`, `admin_group_matches`, `admin_round_robin_preview` + 3 key vào `admin_tournament_events`. Parity: **6145 key × 5**.
- **Tests:** `lib/tournaments/admin/groupSecurity.test.ts` (8 structural), SQL harness `tournament_group_assignment_tests.sql`.

### 15.2 Atomicity qua RPC (quyết định kỹ thuật)
Supabase JS client không gói được transaction đa câu lệnh, nhưng *save replace-all* và *generate/regenerate* phải atomic → **4 DEFINER RPC** (service-role-only). Mỗi hàm:
- Chạy 1 transaction ngầm (all-or-nothing).
- `SELECT … FOR UPDATE` khóa event + so `p_expected_version` **trước** mọi ghi → optimistic-concurrency (stale ⇒ `version_conflict`, không ghi gì); touch cuối bump version qua trigger.
- Trả `jsonb {code, …}` → action map thành typed result; **không** lộ SQL error ra UI.
- `SECURITY DEFINER` + pinned `search_path` + `REVOKE … FROM PUBLIC, anon, authenticated` (Supabase default-privileges cấp EXECUTE cho anon/authenticated nên REVOKE PUBLIC là **chưa đủ** — đã phát hiện & sửa trong test local) + `GRANT EXECUTE … TO service_role`.

RPC & codes:
- `tournament_initialize_groups(event, version, names[])` → `ok|not_found|wrong_format|version_conflict|has_matches|would_orphan`. Idempotent (ON CONFLICT (event,name)); xoá group thừa **rỗng**; group thừa còn người ⇒ `would_orphan` (KHÔNG âm thầm xoá membership); chặn khi đã có group match.
- `tournament_save_group_assignments(event, version, jsonb)` → `ok|…|invalid|has_matches`. Delete-all + re-insert; composite FK + `unique(event,competitor)` bắt cross-event/duplicate ⇒ `invalid` (rollback sub-tx). Chặn khi đã có match.
- `tournament_generate_group_matches(event, version, jsonb)` → `ok|already_generated|version_conflict|invalid|wrong_format`. Idempotent: đã có group match ⇒ `already_generated` (không ghi); `ON CONFLICT (event,generation_key) DO NOTHING` là backstop; set `status='group_stage'`.
- `tournament_regenerate_group_matches(event, version, jsonb)` → `ok|event_has_results|event_has_knockout|version_conflict|invalid`. Chặn nếu có completed match / có `tournament_match_games` / có stage='knockout'; DELETE stage='group' + INSERT mới trong 1 tx; KHÔNG đụng stage khác.

### 15.3 Luồng action (server-authoritative)
`checkIsAdmin()` → verify `loadEvent(event↔tournament)` + chặn knockout → **reload ground truth** (`loadGroupState`) → validate (permutation cho save; `evaluateReadiness` cho generate/regenerate → `not_ready`) → dựng match bằng `buildRoundRobinMatches` (dùng `generateRoundRobin` verbatim) → RPC (forward `expectedVersion`) → map code → audit → revalidate → typed result. Preview/generate **không tin** client: server luôn dựng lại từ DB.

### 15.4 Drag-and-drop + a11y
`@dnd-kit` (Pointer + Keyboard sensor, `sortableKeyboardCoordinates`, `closestCorners`) cho desktop/tablet/touch. Mỗi chip còn có **nút** ↑/↓ (thứ tự), ◀/▶ (bảng trước/sau), và `<select>` "Chuyển đến bảng" — tất cả gọi cùng reducer thuần `group-board.ts` nên hành vi trùng khớp và payload xác định. Board đọc-only khi đã có match (locked) → chỉ còn nút *Tạo lại lịch* (guarded). Validation hiển thị: ai chưa xếp, bảng nào thiếu người, bảng nào vượt qualifier capacity. Preview modal deterministic; Generate bị chặn khi còn thay đổi chưa lưu (server đọc DB, không đọc client state).

### 15.5 Audit
`groups_initialized`, `group_assignments_updated`, `group_matches_generated`, `group_matches_regenerated` — metadata chỉ group_count / competitor_count / match_count (KHÔNG token/cookie/secret).

### 15.6 Kết quả kiểm thử (local)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **171/171** (131 cũ + 33 domain + 8 structural — trừ chồng chéo) |
| Full lib suite (`npm test`) | ✅ EXIT 0 |
| SQL harness `tournament_group_assignment_tests.sql` (BEGIN…ROLLBACK, local) | ✅ **ALL … PASSED** (anon/authenticated bị chặn EXECUTE; init idempotent + would_orphan; save permutation + cross-event invalid; generate idempotent; regenerate guards; stage khác không bị xoá; version_conflict) |
| Migration apply / rollback / re-apply / re-test (local) | ✅ full cycle EXIT 0 |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (file tournament mới) | ✅ 0 warning |
| `npm run i18n:check` | ✅ 6145 key × 5 locale |
| `next build` | ✅ (xem báo cáo) |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 15.7 Schema note (không phải blocker)
Không phát hiện schema blocker. Migration Prompt-02 **không** bị sửa — Prompt 06 chỉ thêm 4 DEFINER function. Group match ghi `status='ready'`, `bracket=NULL`, `group_id NOT NULL` (đúng CHECK `tm_group_shape`); `generation_key` từ cặp đã sort (reversal-proof) làm backstop idempotent. **KHÔNG** tạo match competitor-vs-BYE.

### 15.8 Để lại cho Prompt 07+
Nhập tỉ số + standings + qualification/override, knockout generation/seeding, bracket UI, public page, realtime. Group match hiện ở `status='ready'` chờ Prompt 07 nhập điểm.

**Kết thúc Prompt 06. Dừng lại, không tự sang Prompt 07. Không push/deploy.**

---

## 16. Prompt 07 — Nhập tỉ số, Bảng xếp hạng & Phân định tie (round_robin + group_knockout)

> **Trạng thái:** triển khai + kiểm thử **local** (Supabase WSL Docker `supabase_db_*`, cổng 54422) — **KHÔNG** chạm production, **KHÔNG** push/deploy. Chỉ áp dụng nhập điểm cho match `stage='group'`; knockout để dành Prompt 08.

### 16.1 Files tạo/sửa
- **Domain (pure, colocated `.test.ts`, `node --test`):**
  - `lib/tournaments/domain/score-input.ts` (+8 test) — `validateMatchScores`: kiểm tra integer/không âm/không hoà/không rỗng/không bất phân thắng bại rồi **gọi thẳng `deriveMatchOutcome`** (KHÔNG viết lại luật thắng). Trả discriminated result + code ổn định.
  - `lib/tournaments/domain/tie-resolution.ts` (+5 test) — `resolveTieOrder`: biến thứ tự Admin của MỘT tie group thành `resolvedOrder` đầy đủ của cả bảng (giữ nguyên vị trí competitor ngoài tie). `NO_SUCH_TIE` / `INVALID_PERMUTATION`.
  - `lib/tournaments/domain/event-progress.ts` (+6 test) — `evaluateGroupStage`: **compose** `calculateStandings`+`classifyTies`+`qualifyGroup` cho mọi bảng → per-group standings/ties/qualification + trạng thái event suy diễn (`group_stage`/`group_stage_completed`/`knockout_ready`/`completed`). Là single source of truth dùng CHUNG cho read layer và các action tính status.
  - Barrel `domain/index.ts` re-export cả ba.
- **Types:** mở rộng `lib/tournaments/admin/types.ts` — `MatchView`, `MatchGameView`, `StandingRowView`, `TieGroupView`, `GroupStandingsView`, `ScoringWorkspace`, `QualificationSlot`, `ScoreMutationError/Result` (view types thuần, KHÔNG lộ runtime domain vào client).
- **Queries (server-only):** `getScoringWorkspaceForAdmin` trong `lib/tournaments/admin/queries.ts` — 1 chỗ nạp group matches (+games), roster, groups, overrides; verify event↔tournament + không knockout; gọi `evaluateGroupStage` → view. `pointsFor/Against` = **tổng điểm mọi game** (không phải số game thắng).
- **Actions:** 4 action mới trong `app/admin/giai-dau/[id]/noi-dung/actions.ts` — `saveGroupMatchResult`, `clearGroupMatchResult`, `saveQualificationOverride`, `deleteQualificationOverride` (tái dùng `loadEvent`/`writeAudit`/`currentUserId`/revalidate).
- **Migration:** `supabase/migration_tournament_scoring.sql` (+ `_rollback.sql`, `tournament_scoring_tests.sql`) — **chỉ CREATE FUNCTION**, KHÔNG sửa schema Prompt-02.
- **UI (client):** `components/tournaments/admin/ScoreEditor.tsx`, `MatchResultsPanel.tsx`, `StandingsTable.tsx`, `TieResolutionPanel.tsx`; `EventWorkspace.tsx` thêm tab **Lịch & kết quả / Bảng xếp hạng / Phân định** + status banner. `[eventId]/page.tsx` nạp `getScoringWorkspaceForAdmin`.
- **i18n:** 4 namespace mới × 5 locale — `admin_match_scores`, `admin_group_standings`, `admin_qualification`, `admin_tie_resolution`. Parity: **6243 key × 5**.
- **Tests:** `lib/tournaments/admin/scoringSecurity.test.ts` (11 structural), SQL harness `tournament_scoring_tests.sql`.

### 16.2 Atomicity qua RPC (quyết định kỹ thuật)
4 DEFINER RPC service-role-only, mỗi hàm 1 transaction ngầm:
- `tournament_save_match_result(match, event, expected_match_version, games, winner, target_status)` → thay TOÀN BỘ games + set winner + `status='completed'` + **xoá override của bảng đó** (kết quả đổi ⇒ tie-break cũ có thể lỗi thời) + set event status. Guard **match version** (`version_conflict`). Codes: `ok|not_found|wrong_stage|not_scoreable|version_conflict|has_knockout|invalid`.
- `tournament_clear_match_result(match, event, expected_match_version)` → xoá games, winner→NULL, `status='ready'`, xoá override, status về `group_stage`.
- `tournament_save_qualification_override(event, group, expected_event_version, resolved_order, reason, actor, target_status)` → upsert override (ON CONFLICT event,group). Guard **event version**.
- `tournament_delete_qualification_override(event, group, expected_event_version, target_status)` → xoá override, tính lại status.
- **Winner LUÔN do `deriveMatchOutcome` (action) suy ra** rồi truyền vào; RPC không tự suy — CHECK DB (`tmg_no_tie`, score≥0, winner∈{a,b}) là hàng rào cuối.
- **Status clamp:** RPC tự tính "coarse completion" bằng SQL (mọi group match hết `ready/pending`) và **kẹp** `target_status` do action tính: chỉ cho `knockout_ready`/`completed`/`group_stage_completed` khi **thật sự** đã xong hết → không bao giờ nhảy trạng thái khi còn trận chưa đá (chống TOCTOU giữa nhiều admin).
- Tất cả REFUSE bằng `has_knockout` khi đã có match `stage='knockout'` (Prompt 07 không cascade vào knockout — correction sau seeding là reset của Prompt 08).
- `SECURITY DEFINER` + pinned `search_path` + `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role`.

### 16.3 Luồng action (server-authoritative)
`checkIsAdmin()` → `loadEvent` (event↔tournament, chặn knockout `wrong_format`) → load match (verify `event_id`, `stage='group'`, đủ 2 competitor, scoreable) → `validateMatchScores` (⇒ winner) → **reload ground truth** (`loadGroupEvalRaw`) → áp edit vào bộ nhớ → `evaluateGroupStage` ⇒ `target_status` → RPC (forward version) → map code → audit → revalidate. Override: validate tie tồn tại theo **standings hiện tại** (`calculateStandings`+`resolveTieOrder`), input là **permutation đúng của đúng tie group**, không đụng competitor ngoài tie group.

### 16.4 Standings / Qualification / Tie (UI)
- **BXH** (`StandingsTable`): cột Hạng/VĐV/Trận/Thắng/Thua/Điểm/Điểm ghi/Điểm thua/Hiệu số; chỉ match `completed` được tính; thắng=1đ/thua=0đ; sort `điểm↓→hiệu số↓→điểm ghi↓`; bằng tuyệt đối ⇒ **shared rank** (dấu `=`), KHÔNG dùng tên/seed/ID làm tiêu chí thể thao.
- **Qualification preview** (chỉ `group_knockout`): đánh dấu mỗi hàng `championship`/`consolation`/`none`/`undetermined` (khi bị tie chặn) — **không chỉ dùng màu** (có ký hiệu + nhãn). Winner lấy trước, consolation lấy các hạng kế.
- **Tie** (`TieResolutionPanel`): tie cắt ranh giới suất ⇒ `blockingTies`, chặn `knockout_ready`, mở dialog cho Admin sắp thứ tự (nút ↑/↓) + lý do → lưu override "Ban tổ chức phân định"; có nút xoá phân định về unresolved. Score đổi ⇒ override tự xoá (RPC).

### 16.5 Event completion & status
`evaluateGroupStage` quyết định: chưa xong hết ⇒ `group_stage`; `round_robin` xong ⇒ `completed`; `group_knockout` xong + còn critical tie ⇒ `group_stage_completed` (chưa knockout_ready); `group_knockout` xong + không tie ⇒ `knockout_ready`. **Tính lại từ DB truth mỗi lần save/clear/override**, không tin client.

### 16.6 Audit
`group_match_result_created` / `_updated` / `_cleared`, `qualification_override_created` / `_deleted` — metadata: match/group/event id, status/winner trước-sau, event_status_after, tie_group/resolved_order. **KHÔNG** token/cookie/secret.

### 16.7 Kết quả kiểm thử (local)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **201/201** (171 cũ + 19 domain + 11 structural) |
| SQL harness `tournament_scoring_tests.sql` (BEGIN…ROLLBACK, local 54422) | ✅ **ALL … PASSED** (anon/authenticated bị chặn EXECUTE; stale match version; not_scoreable/wrong_stage; multi-game points; status clamp; knockout_ready; override upsert/delete + version_conflict; score đổi xoá override; has_knockout chặn save/clear/override) |
| Migration apply / idempotent / rollback / re-apply / re-test (local) | ✅ full cycle EXIT 0 |
| Regression `tournament_core_tests.sql` + `tournament_group_assignment_tests.sql` | ✅ PASSED |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (file tournament) | ✅ 0 warning |
| `npm run i18n:check` | ✅ 6243 key × 5 locale |
| `next build` | ✅ Compiled successfully |
| Secret scan file mới | ✅ sạch (chỉ comment "NEVER secrets") |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 16.8 Schema note (không phải blocker)
Không phát hiện schema blocker. Migration Prompt-02 **không** bị sửa — Prompt 07 chỉ thêm 4 DEFINER function. `tournament_qualification_overrides.resolved_order` (jsonb, permutation của roster bảng) khớp input `resolvedOrder` của `qualifyGroup`. `tournament_match_games` CHECK (`tmg_no_tie`, score≥0) backstop cho validate score.

### 16.9 Để lại cho Prompt 08+
Knockout-only seeding + generate knockout + bracket UI + podium UI + public page + realtime; reset downstream knockout đã có kết quả (correction sau seeding hiện bị `has_knockout` chặn). Concurrency đa-admin trên nhiều match cùng event: RPC clamp status bằng SQL đảm bảo an toàn (không nhảy `knockout_ready` khi còn trận `ready`); trường hợp hiếm một edit song song *tạo* tie mới ngay sau khi action đã tính status thì read layer/Prompt-08 generate sẽ re-validate.

**Kết thúc Prompt 07. Dừng lại, không tự sang Prompt 08. Không push/deploy.**

---

## 17. Prompt 08 — Knockout-only: Seeding, Bracket, Kết quả & Podium

> **Trạng thái:** triển khai + kiểm thử **local** (Supabase WSL Docker `supabase_db_*`, cổng 54422) — **KHÔNG** chạm production, **KHÔNG** push/deploy. Chỉ áp dụng event format **`knockout`**; `group_knockout` để dành Prompt 09 (event detail vẫn hiện workspace vòng bảng như Prompt 06/07 cho group_knockout, **không** triển khai sớm knockout seeding từ group-rank).

### 17.1 Files tạo/sửa
- **Domain (pure, colocated `.test.ts`, `node --test`):**
  - `lib/tournaments/domain/knockout-seed.ts` (+23 test) — `requiredBracketSize`/`knockoutByeCount` (power-of-two, 3→4/5·6→8/10→16); `validateSeedPayload` (permutation của competitor: seeded ∪ unassigned = roster, không foreign/dup/missing); `evaluateSeedReadiness` (≥2 + không ai chưa xếp) trả `bracketSize`/`byes`; `buildKnockoutBracketFromSeeds` + `buildKnockoutPreview` (deterministic) + `buildKnockoutMatchRows` — **gọi thẳng `generateKnockout`**, và dùng **`progressKnockout` để auto-advance BYE** vào slot vòng sau (không viết lại thuật toán, không 0–0); `reconstructBracketForProgression` dựng lại bracket từ DB rows để result-actions tái dùng `progressKnockout`.
  - Barrel `domain/index.ts` re-export.
- **Types:** mở rộng `lib/tournaments/admin/types.ts` — `KnockoutSeedSetup`, `KnockoutMatchView`, `KnockoutRoundView`, `PodiumRowView`, `KnockoutWorkspace`, `KnockoutMutationError/Result` (view types thuần, không lộ runtime domain vào client).
- **Queries (server-only):** `getKnockoutSeedSetupForAdmin` (roster + seeded/unassigned + bracketSize/byes) và `getKnockoutWorkspaceForAdmin` (rounds + games + podium; final/third-place nhận diện **cấu trúc**: third = match fed-by-two-losers, final = terminal non-third) trong `lib/tournaments/admin/queries.ts`. Verify event↔tournament + format='knockout'.
- **Actions:** 6 action mới trong `app/admin/giai-dau/[id]/noi-dung/actions.ts` — `saveKnockoutSeeds`, `clearKnockoutSeeds`, `generateKnockoutBracket`, `resetKnockoutBracket`, `saveKnockoutMatchResult`, `clearKnockoutMatchResult` (tái dùng `loadEvent`/`writeAudit`/`currentUserId`/revalidate của Prompt 05).
- **Migration:** `supabase/migration_tournament_knockout_bracket.sql` (+ `_rollback.sql`, `tournament_knockout_bracket_tests.sql`) — **chỉ CREATE FUNCTION** (6 DEFINER RPC), KHÔNG sửa schema Prompt-02.
- **UI (client):** `components/tournaments/admin/SeedEditor.tsx` (dnd-kit + a11y, **tái dùng reducer `group-board.ts`** với 2 container: Unassigned + Seeds), `KnockoutPreviewPanel.tsx`, `BracketView.tsx` (cột/round, horizontal-scroll mobile, HTML/CSS semantic — không canvas), `KnockoutResultsPanel.tsx`, `KnockoutScoreEditor.tsx` (mirror ScoreEditor, gọi knockout actions), `PodiumPanel.tsx`, `KnockoutWorkspace.tsx` (tabs: Vận động viên / Xếp nhánh / Nhánh đấu / Kết quả / Thành tích). `[eventId]/page.tsx` render `KnockoutWorkspace` cho knockout (thay CTA disabled Prompt 05).
- **i18n:** 4 namespace mới × 5 locale — `admin_knockout_seeding`, `admin_knockout_bracket`, `admin_knockout_results`, `admin_podium`. Parity: **6336 key × 5**.
- **Tests:** `lib/tournaments/admin/knockoutSecurity.test.ts` (12 structural), SQL harness `tournament_knockout_bracket_tests.sql`.

### 17.2 Atomicity qua RPC (6 DEFINER RPC service-role-only)
Mỗi hàm 1 transaction ngầm, `SELECT … FOR UPDATE` + so version **trước** ghi, trả `jsonb {code}`, `SECURITY DEFINER` + pinned `search_path` + `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`:
- `tournament_save_knockout_seeds(event, version, slots)` → replace-all seed slots (`source_type='competitor'`); composite FK/unique(event,bracket,slot_index) bắt foreign/dup ⇒ `invalid`; chặn khi bracket đã tạo (`has_matches`).
- `tournament_clear_knockout_seeds(event, version)` → xoá seeds; chặn `has_matches`.
- `tournament_generate_knockout(event, version, matches)` → **2 pass**: insert rows (competitor slots + status + winner cho BYE) rồi wire `source_match_*_id` bằng cách resolve source **generation_key → id** trong event; idempotent (`already_generated`); set `status='knockout_running'`. `ON CONFLICT (event, generation_key) DO NOTHING` backstop.
- `tournament_reset_knockout(event, version)` → xoá knockout matches (+games cascade) + podium, về `status='setup'` (**giữ seeds**); chặn `event_has_results` nếu có completed match / games / podium.
- `tournament_save_knockout_result(match, event, match_version, games, winner, patches, podium, event_status)` → replace games + winner + `completed`; **advance** winner/loser vào downstream slots (patches từ `progressKnockout`, pending→ready khi đủ 2 người); ghi/ xoá podium + set event status **clamp theo SQL truth** (final + third-place — nếu có — đều completed). **Correction guard:** patch làm đổi slot của downstream **đã completed** ⇒ `downstream_has_results` (không cascade).
- `tournament_clear_knockout_result(match, event, match_version, clear_slots)` → xoá games, match→`ready`, null các downstream slot đã fed (→`pending`), xoá podium, về `knockout_running`; chặn `downstream_has_results` nếu downstream đã completed.

### 17.3 Luồng action (server-authoritative)
`checkIsAdmin()` → `loadEvent` (event↔tournament, chặn non-knockout `wrong_format`) → **reload DB truth** (seed state / board) → validate bằng pure engine (`validateSeedPayload`/`evaluateSeedReadiness`; winner qua `validateMatchScores`→`deriveMatchOutcome`; downstream qua `progressKnockout`; podium qua `calculatePodium`) → RPC (forward version, patches là **match_id server tự resolve từ matchKey**) → map code → audit → revalidate. **Seed order = index mảng** (không tin slot value client). Progression/podium/completion **luôn tính từ DB truth**.

### 17.4 BYE, seeding & a11y
- **BYE** là slot kind (`generateKnockout`): match `status='bye'`, 1 competitor + winner (KHÔNG 0–0), winner auto-advance vào vòng sau ngay khi generate (kể cả cascade 2 bye gặp nhau ở vòng 2 → match đó `ready` luôn). BYE không nhập điểm (`not_scoreable`).
- **Seed editor**: kéo-thả (Pointer+Keyboard sensor) + nút ↑/↓ (thứ tự), ◀/▶ (Unassigned↔Seeds) + `<select>` — tất cả qua reducer `group-board.ts` nên payload xác định. Preview deterministic (`buildKnockoutPreview`): tổng VĐV / cỡ nhánh / BYE / số vòng / cặp vòng 1 / placeholder tứ-bán-chung kết / tranh hạng ba. Generate bị chặn khi còn thay đổi chưa lưu (server đọc DB).
- **Bracket UI**: mỗi round là 1 cột, card rõ competitor/score/status, chung kết & tranh hạng ba tách rõ; mobile scroll ngang có chủ đích, heading rõ, không cắt card, HTML/CSS (không canvas).

### 17.5 Podium & completion
`calculatePodium` per-bracket: có tranh hạng ba → 1=thắng CK, 2=thua CK, 3=thắng trận tranh; không có → 1/2 + 2 loser bán kết **đồng hạng ba**; bracket cỡ 2 (không bán kết) → chỉ 1/2. Podium chỉ ghi khi bracket xong; correction làm mất completion ⇒ xoá podium. Event `knockout` `completed` khi final (+ third-place nếu có) completed; khi đó không cho sửa seeds, không reset đơn giản. Tất cả clamp trong RPC bằng SQL.

### 17.6 Audit
`knockout_seeds_updated`, `knockout_bracket_generated`, `knockout_bracket_reset`, `knockout_result_created`/`_updated`/`_cleared`, `knockout_progressed`, `podium_calculated`, `event_completed` — metadata chỉ ids/counts/winner/status (KHÔNG token/cookie/secret).

### 17.7 Kết quả kiểm thử (local)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **236/236** (201 cũ + 23 domain knockout-seed + 12 structural) |
| SQL harness `tournament_knockout_bracket_tests.sql` (BEGIN…ROLLBACK, local 54422) | ✅ **ALL … PASSED** (anon/authenticated bị chặn EXECUTE; seed foreign/dup invalid; generate idempotent; seeds locked sau generate; SF→final/third advance; final xong nhưng third pending ⇒ chưa podium/chưa completed; correction downstream-completed ⇒ downstream_has_results; third xong ⇒ podium + completed; reset có kết quả ⇒ event_has_results; stale version; BYE auto-advance + not_scoreable; reset không kết quả ⇒ setup) |
| Migration apply / idempotent / rollback / re-apply / re-test (local) | ✅ full cycle EXIT 0 (RPC gone sau rollback) |
| Regression `tournament_core/group_assignment/scoring_tests.sql` | ✅ PASSED |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (lib/components/app tournament) | ✅ 0 warning |
| `npm run i18n:check` | ✅ 6336 key × 5 locale |
| `next build` | ✅ Compiled successfully |
| Secret scan file mới | ✅ sạch |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 17.8 Schema note (không phải blocker)
Không phát hiện schema blocker. Migration Prompt-02 **không** bị sửa — Prompt 08 chỉ thêm 6 DEFINER function. Dùng đúng cột schema Prompt-02: `tournament_knockout_seed_slots(source_type='competitor', slot_index, competitor_id)` cho seeds; `tournament_matches(stage='knockout', bracket='championship', source_match_*_id/source_outcome_*, generation_key=matchKey, status bye/ready/pending/completed)`; `tournament_podium(rank, is_joint)` cho đồng hạng ba. `generation_key` từ `generateKnockout` (`ko:championship:r{n}:m{n}` / `ko:championship:third`) là backstop idempotent.

### 17.9 Để lại cho Prompt 09
`group_knockout`: knockout từ **group-rank token** (Nhất A / Nhì B) cho cả championship + consolation; sinh 2 nhánh từ qualification vòng bảng; reset dependency path đã completed (nâng cao) để Prompt 11; public Guest page + realtime để phase sau.

**Kết thúc Prompt 08. Dừng lại, không tự sang Prompt 09. Không push/deploy.**

---

## 18. Prompt 09 — Group + Knockout: nhánh thắng, nhánh thua & podium

> **Trạng thái:** triển khai + kiểm thử JS/TS **local** — **KHÔNG** chạm production, **KHÔNG** push/deploy. Chỉ triển khai format **`group_knockout`**; **không** đổi flow `round_robin` hay `knockout`. SQL harness + migration cycle: **đã viết** theo đúng pattern đã-pass của Prompt 08 nhưng **CHƯA chạy trong session này** (môi trường Windows không có Postgres/Docker local) — chạy trong WSL Docker stack như các phase trước.

### 18.1 Nguyên tắc cốt lõi — tái sử dụng tối đa
`generateKnockout` đã hỗ trợ entrant `group_rank`; schema Prompt-02 đã có cột `bracket` (championship/consolation) trên `tournament_matches`, `tournament_knockout_seed_slots` (source_type='group_rank', source_group_id, source_rank) và `tournament_podium`. Vì vậy Prompt 09 **không** viết lại thuật toán nào — chỉ thêm lớp **group-rank token** phía trên và nhân đôi theo 2 nhánh.

### 18.2 Files tạo/sửa
- **Domain (pure, colocated `.test.ts`, +19 test):**
  - `lib/tournaments/domain/group-knockout-seed.ts` — `groupRankTokenId`/`parseGroupRankTokenId` (token ổn định `group:<groupId>:rank:<rank>`), `buildGroupRankTokens` (chia token theo suất: rank ≤ winnerQ → championship, rank kế tiếp → consolation; disjoint), `validateBranchSeedPayload`/`evaluateBranchSeedReadiness` (**tái dùng** `validateSeedPayload`/`evaluateSeedReadiness` trên không gian token), `resolveGroupRankToken`/`resolveBranchSeeds` (token → competitor từ `QualificationOutcome` hiện tại; fail-safe, không throw).
  - `knockout-seed.ts`: thêm tham số `bracket` (mặc định 'championship') cho `buildKnockoutBracketFromSeeds`/`buildKnockoutPreview` để nhánh consolation dùng lại đúng materialization (generation key nhúng bracket → không đụng key champ). Barrel `index.ts` re-export.
- **Types:** `admin/types.ts` — `GroupRankTokenView`, `BranchSeedState`, `GroupKnockoutSeedSetup`, `BranchWorkspace`, `GroupKnockoutWorkspace`, `GroupKnockoutBlockReason`; thêm code `qualification_changed` vào `KnockoutMutationError`.
- **Queries (server-only):** `getGroupKnockoutSeedSetupForAdmin` (roster+groups+token 2 nhánh với preview resolve từ standings hiện tại + seed order đã lưu + readiness/blockReason theo `evaluateGroupStage`) và `getGroupKnockoutWorkspaceForAdmin` (2 nhánh: rounds+games+podium+status; final/third nhận diện **cấu trúc** trong từng bracket; event complete = champ done ∧ (không có conso ∨ conso done)).
- **Actions:** 6 action mới trong `.../noi-dung/actions.ts` — `saveGroupKnockoutSeeds`, `clearGroupKnockoutSeeds`, `generateGroupKnockoutBrackets`, `resetGroupKnockoutBrackets`, `saveGroupKnockoutMatchResult`, `clearGroupKnockoutMatchResult` (tái dùng `loadEvent`/`writeAudit`/`loadGroupEvalRaw`/`loadKnockoutMatches`/`progressKnockout`/`calculatePodium`).
- **Migration:** `supabase/migration_tournament_group_knockout.sql` (+ `_rollback.sql`, `tournament_group_knockout_tests.sql`) — **chỉ CREATE FUNCTION** (6 DEFINER RPC + 1 helper `tournament_gk_branch_complete`), KHÔNG sửa schema Prompt-02.
- **UI (client):** `GroupKnockoutSeedEditor.tsx` (2 nhánh độc lập, **tái dùng reducer `group-board.ts`** + dnd-kit + nút a11y; token label "Nhất bảng A" + preview competitor; preview bracket/nhánh dùng `buildKnockoutPreview`), `GroupKnockoutBranchPanel.tsx` (bracket/kết quả/podium mỗi nhánh, **tái dùng** `BracketView`/`KnockoutResultsPanel`/`PodiumPanel`); `KnockoutScoreEditor`/`KnockoutResultsPanel` nhận `saveAction`/`clearAction` injectable (mặc định knockout-only) để nhánh group_knockout gọi action riêng. `EventWorkspace.tsx` thêm 3 tab (Xếp nhánh / Nhánh thắng / Nhánh thua) khi `knockout_ready`/đã generate; `[eventId]/page.tsx` nạp 2 query mới.
- **i18n:** namespace mới `admin_group_knockout` (27 key × 5 locale) + `err_qualification_changed`. Parity: **6364 key × 5**.
- **Tests:** `lib/tournaments/admin/groupKnockoutSecurity.test.ts` (12 structural), SQL harness `tournament_group_knockout_tests.sql`.

### 18.3 Atomicity qua RPC (6 DEFINER + 1 helper, service-role-only)
Mỗi hàm 1 transaction ngầm, `SELECT … FOR UPDATE` + so version **trước** ghi, trả `jsonb {code}`, `SECURITY DEFINER` + pinned `search_path` + `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`:
- `tournament_save_group_knockout_seeds(event, version, slots)` → replace-all **group_rank** seed slots CẢ HAI nhánh (`{bracket, slot_index, source_group_id, source_rank}`); composite FK/unique bắt cross-event/dup ⇒ `invalid`; chặn khi đã có knockout match (`has_matches`).
- `tournament_clear_group_knockout_seeds` → xoá group_rank slots; chặn `has_matches`.
- `tournament_generate_group_knockout(event, version, matches)` → insert rows cả 2 nhánh (mỗi row mang `bracket`) trong **một** tx (branch lỗi ⇒ rollback toàn bộ) + wire source theo key (branch-prefixed nên không cross-branch); idempotent (`already_generated`); set `knockout_running`.
- `tournament_reset_group_knockout(event, version)` → xoá knockout matches (+games cascade) + podium cả 2 nhánh; chặn `event_has_results`; về **`knockout_ready`** (giữ seeds; group stage vẫn xong).
- `tournament_save_group_knockout_result(match, event, match_version, games, winner, bracket, patches, branch_podium)` → replace games + winner + advance trong **cùng bracket** (patch scope `AND bracket=p_bracket`); ghi podium NHÁNH khi nhánh xong (helper `tournament_gk_branch_complete`); **event `completed` chỉ khi champ xong ∧ (không có conso ∨ conso xong)** — clamp SQL. Correction guard `downstream_has_results`.
- `tournament_clear_group_knockout_result(match, event, match_version, clear_slots)` → xoá games/reset ready + null downstream slots cùng bracket; xoá podium nhánh; về `knockout_running`; chặn `downstream_has_results`.

### 18.4 Luồng action (server-authoritative)
`checkIsAdmin()` → `loadEvent` (event↔tournament, chặn non-group_knockout `wrong_format`) → **reload group stage truth** (`loadGroupEvalRaw` → `evaluateGroupStage`) → yêu cầu `knockout_ready` → build token (`buildGroupRankTokens`) → verify payload là permutation ĐÚNG token hiện tại (set khác ⇒ `qualification_changed`) → seed lưu group_rank (slot_index = array index) → generate: reload seed order DB, **resolve token → competitor từ standings hiện tại** (`resolveBranchSeeds`; unresolved ⇒ `qualification_changed`), `buildKnockoutBracketFromSeeds(bracket)` + `buildKnockoutMatchRows` → RPC. Result: winner qua `validateMatchScores`→`deriveMatchOutcome`; progression **reconstruct chỉ nhánh của match** (mỗi nhánh có third-place riêng) rồi `progressKnockout`; podium nhánh qua `calculatePodium`. Server luôn tính lại từ DB, không tin token/order/winner/version client.

### 18.5 Quy tắc nghiệp vụ được bảo đảm
- Championship=nhánh thắng, consolation=nhánh thua; **không double-elimination** — patch/podium/completion scope theo bracket, đội thua championship **không** vào consolation (test SQL #7).
- `consolation=0` ⇒ không token/editor/match/podium consolation (query trả `consolation:null`; generate bỏ nhánh); `consolation>0` ⇒ nhánh độc lập.
- Token = nguồn (group+rank), ổn định qua thay đổi standings; **resolve mới** khi generate; seed stale bị chặn bằng event version + so token-set + resolve-time check.
- BYE là slot kind (không 0–0), auto-advance từng nhánh; không nhập điểm.
- Podium 2 nhánh tách theo `bracket`; event completed khi mọi nhánh cần thiết hoàn tất.

### 18.6 Audit
`group_knockout_seeds_updated`, `group_knockout_generated`, `group_knockout_reset`, `championship_result_updated`, `consolation_result_updated`, `group_knockout_progressed`, `branch_podium_calculated`, `group_knockout_completed` — metadata chỉ ids/counts/bracket/winner/status (KHÔNG token/cookie/secret).

### 18.7 Kết quả kiểm thử (session này)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **267/267** (236 cũ + 19 domain group-knockout-seed + 12 structural) |
| Full lib suite (`npm test`) | ✅ **2166/2166** EXIT 0 |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (lib/components/app tournament) | ✅ 0 warning |
| `npm run i18n:check` | ✅ 6364 key × 5 locale |
| `next build` | ✅ Compiled successfully |
| Secret scan file mới | ✅ sạch |
| SQL harness `tournament_group_knockout_tests.sql` + migration cycle | ⏸ **CHƯA chạy trong session** (không có Postgres/Docker local trên Windows) — viết theo pattern đã-pass Prompt 08; chạy trong WSL stack |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 18.8 Để lại cho Prompt 10+
Public Guest page + realtime cho group_knockout; reset dependency-path khi downstream đã completed (nâng cao, Prompt 11); luật điểm chạm 15/21 & handicap theo giải. Correction sau khi một nhánh có kết quả hiện chặn bằng `downstream_has_results`/`event_has_results` (chưa cascade chọn lọc).

**Kết thúc Prompt 09. Dừng lại, không tự sang Prompt 10. Không push/deploy.**

---

## 19. Prompt 10 — Public Guest pages (`/giai-dau`, `/giai-dau/[slug]`)

> **Trạng thái:** triển khai + kiểm thử **local** (Supabase WSL Docker `supabase_db_*`, cổng 54422) — **KHÔNG** chạm production, **KHÔNG** push/deploy. Read-only Guest surface cho cả 3 format (`round_robin`/`knockout`/`group_knockout`). **Không** realtime/polling (để dành Prompt 11), **không** admin mutation mới, **không** reset dependency-path, **không** registration.

### 19.0 Gate Prompt 09 (chạy trong session này)
Chạy trên Supabase local (54422), `ON_ERROR_STOP=1`:
| Bước | Kết quả |
|---|---|
| `migration_tournament_group_knockout.sql` (fresh) | ✅ EXIT 0 (7 function: 6 RPC + 1 helper) |
| Áp dụng lại (idempotency) | ✅ EXIT 0 |
| `tournament_group_knockout_tests.sql` (BEGIN…ROLLBACK) | ✅ **ALL GROUP_KNOCKOUT RPC ASSERTIONS PASSED** |
| rollback → reapply → retest (full cycle) | ✅ EXIT 0 (function DROP sạch sau rollback, retest PASSED) |
| Regression `core/group_assignment/scoring/knockout_bracket_tests.sql` | ✅ tất cả PASSED |

Xác nhận trong harness: RPC chỉ `service_role` EXECUTE (anon/authenticated REVOKE), generate 2 nhánh atomic (branch lỗi ⇒ rollback toàn bộ) + idempotent, BYE/progression/branch-podium/event-completion đúng, correction guard `downstream_has_results`.

### 19.1 Read layer (server-only, anon + RLS — KHÔNG service-role)
- `lib/tournaments/public/queries.ts` (`import 'server-only'`) — dùng **`createPublicClient()`** (anon, cookie-free) ⇒ RLS chỉ trả tournament `published`/`completed` + child rows (helper `tournament_is_public`/`tournament_event_is_public`). Draft/archived ⇒ 0 row ⇒ 404 tự nhiên (không xác nhận draft tồn tại). **Không** đọc `tournament_audit_log`, **không** service-role, **không** tin ID từ URL.
  - `listPublicTournaments()` — 1 query, event count embedded (no N+1); sort ongoing → upcoming → completed.
  - `getPublicTournamentBySlug(slug)` — tournament + events; match/completed-match count từ **1** query matches (no per-event fan-out).
  - `getPublicEventWorkspace(slug, eventId)` — **anti-IDOR**: chỉ trả event nếu `event.tournament_id === tournament(slug).id`. Tái dùng **đúng domain composition**: `evaluateGroupStage` (standings + qualification markers), `buildBracketRounds` (cấu trúc nhánh + final/third-place), podium từ `tournament_podium`. **Không** viết lại thuật toán.
- **Reuse mới:** tách `lib/tournaments/domain/bracket-view.ts` (pure, +5 test) — `knockoutRoundLabel` + `identifyBracket` + `buildBracketRounds` (nhận diện final = terminal non-third, third-place = fed-by-two-losers, group rounds + label). Dùng cho public layer (single source of truth cấu trúc nhánh).
- Types public: `lib/tournaments/public/types.ts` — bỏ field admin-only (`version` optimistic-concurrency, `overrideReason` text, audit). `format.ts` (pure): `formatDateRange`, `tournamentPhase`, `completionPercent`.

### 19.2 Routes & SEO
- `app/giai-dau/page.tsx` (list) + `loading.tsx` + `error.tsx`; `app/giai-dau/[slug]/page.tsx` (detail). Không locale prefix.
- Deep link qua query: `?event=<eventId>` + `?tab=<slug>` (`tong-quan|van-dong-vien|lich-thi-dau|bang-xep-hang|nhanh-dau|thanh-tich`). Reload/share giữ đúng event + tab.
- Slug không public ⇒ `notFound()` + metadata `robots:{index:false}` (không lộ draft). Metadata: title/description/OG/canonical + JSON-LD `BreadcrumbList` + `SportsEvent` (chỉ tournament public).

### 19.3 Tabs (client `TournamentDetail.tsx`, tái dùng component)
Tổng quan (event list + format + status + progress + counts) · Vận động viên (grouped/flat, không lộ internal ID) · Lịch & kết quả (group→round, knockout→bracket/round, filter bảng/trạng thái, BYE/pending rõ, **không** 0–0 giả) · Bảng xếp hạng (chỉ group format; đủ cột Hạng/Trận/T/B/Điểm/Điểm thắng/Điểm thua/Hiệu số; marker vào-nhánh-thắng/thua/chưa-phân-định bằng **ký hiệu + chữ** không chỉ màu; "BTC phân định" khi có override; "=" cho đồng hạng) · Nhánh đấu (**tái dùng `BracketView` admin** read-only, sub-tab Nhánh thắng/Nhánh thua khi có consolation) · Thành tích (podium mỗi nhánh; đồng hạng ba; không trộn championship/consolation; chỉ hiện khi đủ điều kiện). Tabs a11y: `role=tablist/tab/tabpanel`, mũi tên trái/phải, focus rõ. Link điều lệ `target=_blank rel="noopener noreferrer nofollow"`. Nút Chia sẻ (copy URL/Web Share) + Làm mới (`router.refresh()`).

### 19.4 Trạng thái thiếu dữ liệu & cache
- Mọi tab có empty state riêng (chưa VĐV/chưa chia bảng/chưa lịch/vòng bảng chưa xong/chưa knockout/chưa kết quả/chưa podium) — **thiếu dữ liệu = "chưa bắt đầu", KHÔNG phải lỗi server**.
- **Cache:** `export const dynamic = 'force-dynamic'` cho cả list + detail (next-intl cookie vốn ép dynamic). Render tươi mỗi request ⇒ kết quả admin nhập hiện ngay, **không** polling, **không** realtime, **không** cache draft. Freshness thủ công qua nút Làm mới. (Realtime = Prompt 11.)

### 19.5 Navigation & Games hub
- `components/NavIcon.tsx`: thêm icon `trophy`. `Nav.tsx` dropdown *Giải trí* + `MobileMenu.tsx`: thêm mục `nav.tournaments` → `/giai-dau`.
- `app/games/page.tsx`: tách 2 section — **"Trò chơi trực tuyến"** (grid game cũ, không đổi) + **"Giải đấu & hoạt động cộng đồng"** (card mới → `/giai-dau`). Tournament vẫn là module độc lập, không nhúng engine vào mini game.

### 19.6 i18n
Namespace mới `tournaments` (public/status/tabs/overview/competitors/schedule/standings/bracket/podium/empty) + `nav.tournaments` + `games.section_*`/`community_card_*` — **5 locale** (vi/en/ja/ko/zh). Parity: **6470 key × 5** (`npm run i18n:check` ✅). BracketView tái dùng namespace `admin_knockout_bracket` sẵn có. Zero-hardcode: mọi text qua key (đã verify mọi key referenced tồn tại).

### 19.7 Tests
- **Structural** `lib/tournaments/public/publicSecurity.test.ts` (8): dùng `createPublicClient` **không** `createAdminClient`/service-role key; không đọc audit; anti-IDOR `event.tournament_id !== tournamentId`; whitelist published/completed (≥3 chỗ); tái dùng `evaluateGroupStage`+`buildBracketRounds`; `import 'server-only'`; không `checkIsAdmin`; detail `notFound()` + noindex.
- **Domain** `bracket-view.test.ts` (5): label theo số trận, nhận diện third/final, group rounds, empty.
- **SQL harness** `supabase/tournament_public_read_tests.sql` (BEGIN…ROLLBACK, local 54422) — bổ sung `completed` + `archived` cho core: anon thấy published+completed (tournament/event/competitor/games/override/podium), **không** thấy draft/archived, audit denied, write denied; authenticated non-admin **parity**. ✅ **ALL PUBLIC-READ RLS ASSERTIONS PASSED**.
- Correctness schedule/standings/bracket/podium/BYE/đồng-hạng-ba/override-label ⇒ đã phủ bởi 267 domain test hiện có (round-robin/standings/qualification/knockout/podium/group-knockout) + `event-progress` compose.

### 19.8 Kết quả kiểm thử (session này)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **280/280** (267 cũ + 5 bracket-view + 8 public structural) |
| Full lib suite (`npm test`) | ✅ **PASS** (xem báo cáo) |
| SQL Prompt 09 cycle + `tournament_public_read_tests.sql` (local) | ✅ ALL PASSED |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (lib/components/app tournament public) | ✅ 0 warning |
| `npm run i18n:check` | ✅ 6470 key × 5 locale |
| `next build` | ✅ (xem báo cáo) |
| Secret scan file mới | ✅ sạch |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 19.9 Để lại cho Prompt 11
Realtime subscription/polling cho public page; reset dependency-path khi downstream đã completed (cascade chọn lọc); luật điểm chạm 15/21 & handicap; registration system. Prompt 10 read-only, không admin mutation mới.

**Kết thúc Prompt 10. Dừng lại, không tự sang Prompt 11. Không push/deploy.**

---

## 20. Prompt 11 — Realtime, sửa kết quả knockout & reset dependency-path

> **Trạng thái:** triển khai + kiểm thử JS/TS **local** — **KHÔNG** chạm production, **KHÔNG** push/deploy. Thêm realtime cho Guest + Admin, connection status + fallback, impact-preview & controlled reset khi sửa kết quả knockout có downstream đã completed. SQL harness + migration cycle **đã viết** theo pattern đã-pass Prompt 08 nhưng **CHƯA chạy trong session này** (Windows không có Postgres/Docker local) — chạy trong WSL Docker stack như các phase trước. **Chưa** làm: luật điểm 15/21, handicap, registration, push, offline/PWA.

### 20.1 Files tạo/sửa
- **Domain (pure, colocated `.test.ts`, +9 test):** `lib/tournaments/domain/knockout-impact.ts` — `analyzeKnockoutCorrection`: tái dựng dependency graph từ persisted match records (đảo chiều `source_match_*`/`source_outcome_*`), tính **transitive downstream closure** trong ĐÚNG bracket của match được sửa; trả `affected` (matches reset + slots phải null + participants + games), `reprogress` (re-feed 1 mức từ winner/loser mới), `podiumWillClear`, `branchesAffected`/`branchesUnaffected`. Barrel `domain/index.ts` re-export.
- **Types:** `lib/tournaments/admin/types.ts` — `ImpactAffectedMatchView`, `KnockoutImpactPreview`, `ImpactPreviewError/Result`, `ResetPathError/Result`. Public: thêm `id` vào `PublicTournamentSummary` (scope realtime; không phải field admin-only).
- **Actions:** `app/admin/giai-dau/[id]/noi-dung/actions.ts` — `previewAffectedKnockoutPath` (READ-ONLY), `resetAffectedKnockoutPath` (mutation; yêu cầu confirmation `RESET`) + helper `loadKnockoutGameCounts`, `boardToImpactRecords`, `knockoutRoundToken`, `loadEventStatusAndSlug`, `revalidatePublicViews`, `competitorNameMap`. Áp dụng cho cả `knockout` và `group_knockout` (per-bracket).
- **Migration:** `supabase/migration_tournament_reset_path.sql` (+ `_rollback.sql`, `tournament_reset_path_tests.sql`) — publish 6 bảng non-secret vào `supabase_realtime` (REPLICA IDENTITY FULL) + 2 DEFINER RPC: `tournament_reset_knockout_path` (atomic reset + re-progress + podium/status recompute) và helper `tournament_reset_bracket_complete`. KHÔNG sửa schema Prompt-02.
- **Realtime UI (client):** `components/tournaments/useTournamentRealtime.ts` (subscription controller: 1 channel/scope, debounce+coalesce, connection status, fallback polling gated theo visibility + disconnected, cleanup chống duplicate channel), `ConnectionIndicator.tsx` (dot-shape + text, aria-live, không chỉ màu). Public: `components/tournaments/public/TournamentDetail.tsx` subscribe scoped → `router.refresh()`. Admin: `components/tournaments/admin/AdminRealtimeBanner.tsx` (indicator + banner "Dữ liệu đã thay đổi — Tải lại", **không** auto-overwrite), nhúng ở `.../[eventId]/page.tsx`.
- **Impact UI (client):** `components/tournaments/admin/ImpactPreviewDialog.tsx` (liệt kê affected theo round, score/podium/status thay đổi, "không thể hoàn tác", nhập đúng `RESET` mới bật nút; accessible modal, không `window.confirm`). `KnockoutScoreEditor.tsx`: khi save trả `downstream_has_results` → gọi preview → mở dialog (dùng chung cho group_knockout branch qua injectable action).
- **i18n:** `tournaments.realtime.*`, `admin_connection_status.*`, `admin_impact_preview.*`, `admin_downstream_reset.*` × 5 locale. Parity: **6522 key × 5**.
- **Tests:** `lib/tournaments/domain/knockout-impact.test.ts` (9), `lib/tournaments/admin/resetPathSecurity.test.ts` (11 structural), SQL harness `tournament_reset_path_tests.sql`.

### 20.2 Realtime architecture
- **Signal, không phải source of truth:** realtime event chỉ báo "dữ liệu đổi" → client fetch lại read model an toàn (`router.refresh()` trên page `force-dynamic`); KHÔNG dựng standings/bracket từ payload rời. Burst (match + games + podium cùng 1 mutation) được **debounce/coalesce** thành 1 refetch (mặc định 400ms) → tránh refetch storm.
- **Scope:** 1 controller cho public detail, 1 cho admin workspace; channel name = `giai-dau:<tid>:<eid>` / `admin-giai-dau:<tid>:<eid>`; subscribe `tournaments(id=)`, `tournament_events(tournament_id=)`, `tournament_matches(event_id=)`, `tournament_match_games`, `tournament_qualification_overrides(event_id=)`, `tournament_podium(event_id=)`. Cleanup `removeChannel` khi unmount/đổi scope → không duplicate channel sau navigation/reconnect.
- **RLS-gated:** Guest anon chỉ nhận row RLS cho phép (published/completed). `tournament_audit_log` **KHÔNG** trong publication → không bao giờ traverse realtime.
- **Connection status + fallback:** `connecting/connected/disconnected/reconnecting`. Disconnected **không** phải lỗi trang: giữ dữ liệu cuối, nút Làm mới, fallback poll **chỉ khi** disconnected/reconnecting **và** tab visible (≥30s/lần), tự dừng khi reconnect. Admin: form đang mở + record đổi từ nơi khác ⇒ banner reload, **không** âm thầm ghi đè (version guard RPC là hàng rào thật).

### 20.3 Impact preview & dependency reset (server-authoritative)
- **previewAffectedKnockoutPath (read-only):** `checkIsAdmin()` → load event (knockout/group_knockout) → reload board DB truth → verify match completed pairing → `validateMatchScores` (winner mới) → `analyzeKnockoutCorrection` → enrich tên/label → trả preview (`requiresReset = winnerChanges ∧ resultsToClear>0`). KHÔNG mutation.
- **resetAffectedKnockoutPath (mutation):** `checkIsAdmin()` → **confirmation phải === `RESET`** (server enforce) → reload DB truth → match version phải khớp token preview (stale ⇒ `version_conflict`) → `validateMatchScores` → `analyzeKnockoutCorrection` (KHÔNG tin impact list client) → build `reset_ids`/`clear_slots`/`patches` → RPC → map code → **audit chain** → revalidate admin + public slug + list.
- **RPC `tournament_reset_knockout_path` (atomic, 1 transaction):** lock upstream FOR UPDATE, verify event/bracket/completed/version → (1) reset downstream match games; (2) reset winners/status; (3) null slots fed từ path (giữ slot của match độc lập); (4) lưu score upstream mới; (5) re-progress winner/loser mới 1 mức (pending→ready khi đủ 2); (6) recompute bracket completion (`tournament_reset_bracket_complete`) → xoá/recreate podium nhánh; (7) recompute event status (knockout ⇒ championship; group_knockout ⇒ championship ∧ (không conso ∨ conso done)) → `completed`/`knockout_running`. Bất kỳ lỗi ⇒ rollback toàn bộ. Mọi id được re-scope `event_id + bracket` nên không chạm nhánh/giải khác. `SECURITY DEFINER` + pinned search_path + `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`.

### 20.4 Dependency graph — quy tắc đảm bảo
Chỉ reset match **thực sự phụ thuộc** (transitive downstream) trong ĐÚNG bracket của match sửa: winner-progression, bán kết-loser→tranh-hạng-ba, knockout-only, group-knockout championship/consolation, BYE path, đa vòng. **KHÔNG** reset: match độc lập cùng round, nhánh còn lại, group-stage, nhánh kia (championship↔consolation), match ngoài graph. Slot fed từ match độc lập được **giữ** (participant không phụ thuộc). Podium chỉ xoá/recreate nhánh bị ảnh hưởng; event từ `completed` lùi `knockout_running` khi một nhánh chưa xong. Group score correction sau khi knockout đã seed vẫn bị chặn (không đổi qualification vòng bảng ở Prompt 11).

### 20.5 Audit
`knockout_dependency_reset`, `knockout_result_corrected`, `downstream_results_cleared`, `podium_invalidated`, `event_reopened`/`event_completed`, `podium_recalculated` — metadata chỉ upstream/bracket/winner cũ-mới/match ids reset/số score xoá/status trước-sau (KHÔNG token/cookie/secret).

### 20.6 Kết quả kiểm thử (session này)
| Hạng mục | Kết quả |
|---|---|
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **300/300** (280 cũ + 9 impact + 11 structural) |
| Full lib suite (`npm test`) | ✅ PASS (xem báo cáo) |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (lib/components/app tournament) | ✅ 0 warning |
| `npm run i18n:check` | ✅ 6522 key × 5 locale |
| `next build` | ✅ (xem báo cáo) |
| Secret scan file mới | ✅ sạch |
| SQL harness `tournament_reset_path_tests.sql` + migration cycle | ⏸ **CHƯA chạy trong session** (không có Postgres/Docker local trên Windows) — viết theo pattern đã-pass Prompt 08; chạy trong WSL stack |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 20.7 Để lại cho Prompt 12
Luật điểm chạm 15/21 & handicap theo giới tính; registration; push notification; offline/PWA; deploy production. Reset qualification + regenerate bracket (khi cần đổi competitor đã qualify vòng bảng) vẫn là workflow riêng chưa xây.

**Kết thúc Prompt 11. Dừng lại, không tự sang Prompt 12. Không push/deploy.**

---

## 21. Prompt 12 — I18n, Responsive, Accessibility & UI Polish

> **Trạng thái:** audit + polish **local** (2026-07-28). **KHÔNG** thêm nghiệp vụ mới, **KHÔNG** đổi URL, **KHÔNG** push/deploy, **KHÔNG** chạm production. Trọng tâm: xác minh chất lượng UI đã có, đóng vài lỗ hổng a11y cụ thể, và khoá lại toàn bộ thuộc tính i18n/a11y/responsive bằng test cấu trúc để không âm thầm regress.

### 21.1 Gate SQL Prompt 11 — ĐÃ CHẠY (khác với ghi chú §20.6 "chưa chạy")
Local stack WSL2 + Docker (`supabase_db_tnmti1r`, cổng 54422). Chu trình đầy đủ với `ON_ERROR_STOP=1`, chạy sạch **0 failure**:
- apply `migration_tournament_reset_path.sql` → **idempotent reapply** → `tournament_reset_path_tests.sql` (`ALL RESET-PATH RPC ASSERTIONS PASSED`).
- **rollback** `migration_tournament_reset_path_rollback.sql` → reapply → retest (pass lại).
- Regression harness: `tournament_core_tests` / `group_assignment` / `scoring` / `knockout_bracket` / `group_knockout` / `public_read` — **tất cả PASS**.
- Grant kiểm chứng: 4 RPC reset (`tournament_reset_knockout_path`, `tournament_reset_knockout`, `tournament_reset_group_knockout`, `tournament_reset_bracket_complete`) chỉ `postgres` (owner) + `service_role` có `EXECUTE`; **PUBLIC/anon/authenticated bị revoke**. Tests xác nhận anon/authenticated không execute được.
- Transaction fail → rollback toàn bộ (tests bọc `BEGIN … ROLLBACK`, `RAISE EXCEPTION` khi sai). Podium/status invalidate + tính lại đúng theo dependency path.

### 21.2 Kết quả audit — UI đã đạt chuẩn từ các phase trước
Audit toàn bộ route admin (`/admin/giai-dau*`) + public (`/giai-dau`, `/giai-dau/[slug]`) + navigation. Phần lớn yêu cầu Prompt 12 **đã được đáp ứng** ở phase trước:
- **I18n:** 0 hardcode user-facing trong module tournament; 20 namespace tournament × 5 locale parity (6523 key). Thuật ngữ tiếng Việt thống nhất (Giải đấu / Nội dung thi đấu / Vòng bảng / Loại trực tiếp / Nhánh thắng-thua / Tranh hạng ba / Ban tổ chức phân định / Hiệu số …).
- **Dialog impact/reset:** đã có `role=dialog` + `aria-modal` + `aria-labelledby`, Escape đóng, focus input khi mở, gate **gõ đúng `RESET`**, disable double-submit, nút nguy hiểm tách biệt, pending/error, responsive `max-h-[90vh]` scroll — **không** `window.confirm`.
- **ConnectionIndicator:** `role=status` + `aria-live=polite`, chấm hình **kèm text** (không color-only), nút Làm mới khi mất realtime.
- **Drag/drop chia bảng:** đã có fallback nút ↑/↓/‹/› + `<select>` chuyển bảng, mỗi control có `aria-label`.
- **Bảng & bracket:** cuộn trong container `overflow-x-auto`; qualification đánh dấu bằng **glyph ◆/▲/? + nhãn text** (không color-only); shared rank hiển thị tường minh.
- **Public detail tabs:** đã đầy đủ WAI-ARIA (`tablist`/`tab`/`aria-selected`/`onKeyDown` mũi tên/`tabpanel`). Public surface **không** import admin action / service-role client.
- **Empty state:** mỗi tab có copy "chưa bắt đầu" riêng (title + hint) — dữ liệu chưa có ≠ lỗi server.

### 21.3 Lỗ hổng a11y cụ thể đã đóng trong Prompt 12
1. **Tabs admin không có ngữ nghĩa tablist.** `EventWorkspace` + `KnockoutWorkspace` render tab bằng `<button>` trơn, thiếu `role=tablist/tab`, `aria-selected`, roving tabindex và điều hướng phím mũi tên. → Thêm primitive dùng chung `components/tournaments/admin/WorkspaceTabs.tsx` (WAI-ARIA tabs: `role=tablist/tab`, `aria-selected`, roving `tabIndex`, Arrow←→↑↓ + Home/End, `focus-visible` ring, badge `aria-hidden` không phải carrier nghĩa duy nhất). Cả hai workspace bọc nội dung trong `role=tabpanel` (`aria-labelledby` tab đang active). Thêm key `tournaments.tabs_label` × 5 locale.
2. **`ConfirmDialog` thiếu labelling + focus management.** Có `role=dialog`/`aria-modal` nhưng thiếu `aria-labelledby`/`aria-describedby`, không focus khi mở, không restore focus khi đóng. → Thêm `useId()` cho title/description, focus nút xác nhận khi mở, **restore focus** về phần tử mở dialog khi đóng.

### 21.4 Test cấu trúc mới — `lib/tournaments/ui-structure.test.ts` (16 test)
Chạy dưới `node --test` (không cần browser), đọc source thật + message files để **khoá** thuộc tính đã audit:
`#1` parity key mọi namespace × 5 locale · `#1b` không rỗng + placeholder khớp vi · `#2` không hardcode VI trong tsx (chừa comment) · `#3` tablist WAI-ARIA (admin + public) · `#4` dialog modal/Escape/focus · `#5` fallback nút cho drag/drop · `#6` connection status accessible không color-only · `#7` qualification icon+text · `#8` bracket overflow-x · `#9` table scroll container · `#10` form chống double-submit · `#11` empty-state copy từng format · `#12` impact dialog buộc gõ `RESET` · `#13` public không import admin/service-role · `#14` nav desktop/mobile/hub link `/giai-dau` · `#15` realtime refresh không hard-reload.

### 21.5 Quality gate
| Hạng mục | Kết quả |
|---|---|
| SQL Prompt 11 (apply/idempotent/rollback/reapply/regression + grant) | ✅ **0 failure** (WSL local `tnmti1r`:54422) |
| JS unit — tournament (`node --test lib/tournaments/**`) | ✅ **316/316** (300 cũ + 16 structural) |
| Full lib suite (`npm test`) | ✅ **2215/2215** |
| `tsc --noEmit --skipLibCheck` | ✅ EXIT 0 |
| `next lint` (tournament scope) | ✅ 0 warning |
| `npm run i18n:check` | ✅ **6523** key × 5 locale |
| `next build` | ✅ EXIT 0 (mọi route compile) |
| Secret scan file mới | ✅ sạch |
| **Supabase production** | ❌ **CHƯA** chạm (không push/deploy) |

### 21.6 Chưa xác minh (trung thực) & để lại cho Prompt 13
- **Chưa** chạy live browser viewport (1440/1280/1024/768/390 + iPhone landscape). Không có Playwright config cho tournament + public page cần data đã publish/admin auth. Thuộc tính responsive/a11y được xác minh qua **test cấu trúc tĩnh + đọc code + `next build`**, **không** tuyên bố pixel-perfect. → Prompt 13: dựng smoke Playwright responsive nhẹ cho `/giai-dau` + admin workspace.
- Migration tournament **chưa** áp production (đúng chủ trương ship-dark tới phase cuối).
- Nghiệp vụ để lại như §20.7: điểm chạm 15/21 & handicap; registration; push; offline/PWA; reset qualification + regenerate bracket.

**Kết thúc Prompt 12. Dừng lại, không tự sang Prompt 13. Không push/deploy.**

---

## 22. Prompt 13 — Playwright E2E & kiểm thử toàn diện

Chi tiết đầy đủ ở **`docs/tournaments/TOURNAMENT_TEST_REPORT.md`**. Tóm tắt:

- **Suite mới `e2e/tournaments/`** chạy browser thật trên **local Supabase (WSL2/Docker, Kong 54421 / DB
  54422)** — **không bao giờ** production. `_env.ts::assertLocalTarget()` từ chối chạy nếu host không
  phải `localhost/127.0.0.1` (không có cờ "allow prod"). Seed/cleanup bằng service-role, **chỉ trong
  Node/test context**, gắn prefix `E2E-<runId>`, dọn bằng cascade — chạy lại nhiều lần không trùng.
- **55/55 E2E PASS**, phủ Scenario A–G + public guest + routes/404 (§16) + console/network audit (§17) +
  a11y (§15) + responsive matrix 6 viewport (§14). Critical subset chạy **×2 = 32 pass/lần, 0 flaky**.
- **Gate xanh:** 9/9 SQL harness tournament (local), unit `2215/2215`, `tsc` sạch, `next lint` 0 error,
  `next build` 137/137 trang, i18n 6523×5.

### 22.1 Bug thật do E2E phát hiện & đã sửa (chỉ đổi app-code này ở Prompt 13)
`tabFromSlug`/`TAB_SLUGS` xuất từ `components/tournaments/public/TournamentDetail.tsx` (`'use client'`) và
được **gọi trong Server Component** `app/giai-dau/[slug]/page.tsx`. Hàm thường export từ Client Component
trở thành *client reference* không gọi được ở phía server → **mọi trang chi tiết giải đấu đã publish đều
throw** `tabFromSlug is not a function` (rơi vào error boundary, trả HTTP 200 do `force-dynamic` nên ẩn
với check chỉ-status và với gate SQL/unit). **Sửa:** tách sang module thường `lib/tournaments/public/tabs.ts`.
→ **Bài học:** không import hàm thường xuyên biên `'use client'` vào Server Component; để ở module trung lập.

### 22.2 Ghi nhận nhỏ (xem report §Findings)
- Tablist public hỗ trợ Arrow nhưng **không** Home/End (admin `WorkspaceTabs` có đủ) — polish tương lai.
- `ConfirmDialog` focus-on-open không ổn định dưới `next dev` + React StrictMode (effect cleanup re-focus
  opener); prod (effect chạy 1 lần) đúng. Gợi ý: `useCallback` cho `onCancel`.
- `notFound()` trả **200** dưới `force-dynamic` ở dev (prod = 404) → test 404 assert theo **nội dung**.

### 22.3 Để lại cho Prompt 14 (đã phủ ở tầng SQL-RPC + unit, chưa drive từng bước qua UI)
Nhập kết quả round-robin qua UI; tiến trình bracket knockout/group-knockout qua UI; reset downstream qua
UI; realtime edge cases (disconnect/polling/stale-banner); tie blocking-detection dialog; xác minh mã
HTTP 404 trên `next build && next start`. Migration tournament **vẫn chưa** áp production (đúng chủ trương).

**Kết thúc Prompt 13. Dừng lại, không tự sang Prompt 14. Không chạy migration production. Không push/deploy.**
