# CLAUDE.md — Chợ Cóc FKO (chococfko)

Context guide cho Claude Code. Đọc file này đầu tiên trước khi làm bất kỳ task nào.

---

## 1. Project Overview

**Tên:** Chợ Cóc FKO — nền tảng cộng đồng người Việt (địa điểm, bài viết, mini game, giải đấu)  
**Domain:** https://chococfko.com  
**Working directory:** `web/` (toàn bộ Next.js app nằm ở đây)

---

## 2. Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 14 App Router (`app/`) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS (JIT) — design tokens trong `globals.css` |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (Google, Facebook, LINE OAuth) |
| i18n | next-intl — 5 ngôn ngữ: `vi` (mặc định), `en`, `ja`, `ko`, `zh` |
| Deploy | Vercel CLI → project `chococfko` → domain `chococfko.com` |

---

## 3. Folder Structure

```
web/
├── app/                    # Next.js App Router routes
│   ├── games/              # Mini games
│   ├── admin/              # Admin panel (yêu cầu ADMIN_EMAILS)
│   ├── auth/               # OAuth callbacks
│   ├── confessions/        # Bài confession
│   ├── cong-dong/          # Bài viết cộng đồng
│   ├── dia-diem/           # Địa điểm
│   └── ho-so/              # Hồ sơ người dùng
├── lib/
│   └── supabase/           # Client helpers (server.ts, admin.ts)
├── messages/               # i18n files: vi.json en.json ja.json ko.json zh.json
├── supabase/               # SQL migration files (chỉ đọc khi cần)
└── public/
```

---

## 4. Main Routes

| Route | Chức năng |
|---|---|
| `/` | Trang chủ |
| `/games` | Hub mini game |
| `/games/caro` | Lobby Cờ caro |
| `/games/caro/[roomCode]` | Phòng chơi Cờ caro |
| `/games/caro/tournaments` | Danh sách giải đấu Cờ caro |
| `/games/caro/tournaments/[tournamentId]` | Chi tiết giải đấu (user) |
| `/games/caro/leaderboard` | Bảng xếp hạng Cờ caro |
| `/games/chinese-chess` | Lobby Cờ tướng |
| `/games/chinese-chess/[roomCode]` | Phòng chơi Cờ tướng |
| `/games/chinese-chess/history` | Lịch sử Cờ tướng |
| `/games/random-wheel` | Vòng quay ngẫu nhiên |
| `/games/destination-wheel` | Vòng quay địa điểm |
| `/games/2048` | Game 2048 |
| `/games/sudoku` | Sudoku |
| `/games/match-3` | Match-3 |
| `/games/minesweeper` | Minesweeper |
| `/admin/caro` | Admin giải đấu Cờ caro |
| `/admin/caro/[tournamentId]` | Admin chi tiết giải đấu |

---

## 5. Supabase / Database

### Client usage
```typescript
import { createClient }      from '@/lib/supabase/server'   // Anon — dùng trong server components
import { createAdminClient } from '@/lib/supabase/admin'    // Service role — dùng trong server actions
```

- `createAdminClient()` bypass RLS — **chỉ dùng trong `'use server'` actions**
- `createClient()` dùng anon key — tuân RLS

### Key tables (Cờ caro tournament)
```
caro_tournaments               — giải đấu (type: single_elimination | group_stage)
caro_tournament_participants   — người tham gia (status: registered | checked_in | champion | eliminated | withdrawn)
caro_tournament_matches        — trận đấu (round_number, match_number, group_id, status, winner_user_id)
caro_tournament_groups         — bảng đấu (group stage)
caro_tournament_group_members  — thành viên từng bảng
caro_tournament_leaderboard    — VIEW (cần chạy migration_caro_leaderboard.sql)
```

### Group stage vs Single elimination
- Group stage matches: `round_number = 0`, `group_id IS NOT NULL`
- SE / knockout matches: `round_number >= 1`, `group_id IS NULL`
- `handleMatchFinished` có guard `if (groupId) return` — **không được xóa**

### Migration files (web/supabase/)
Chỉ tạo migration mới, không sửa file cũ. Các file quan trọng:
- `migration_caro_tournament.sql` — core tournament tables
- `migration_caro_group_stage.sql` — group stage tables + columns
- `migration_caro_leaderboard.sql` — VIEW `caro_tournament_leaderboard`

---

## 6. i18n Rules

- **5 file:** `messages/vi.json`, `en.json`, `ja.json`, `ko.json`, `zh.json`
- **Không hardcode text** trên UI — luôn dùng i18n key
- Server component: `const t = await getTranslations('namespace')`
- Client component: `const t = useTranslations('namespace')`
- Namespace games: `games.caro`, `games.chinese_chess`, `games.random_wheel`, v.v.
- Khi thêm key mới: cập nhật **cả 5 file** cùng lúc
- Không để key i18n hiện trực tiếp trên UI (nghĩa là missing translation)

---

## 7. Coding Rules

- **Không refactor lớn** nếu user không yêu cầu rõ ràng
- **Không sửa nhầm game khác** — mỗi task chỉ đụng đến game/route được chỉ định
- **Không thêm comment** trừ khi logic không hiển nhiên (không comment WHY đã rõ)
- **Không tạo file docs/README** trừ khi được yêu cầu
- Server actions: file `actions.ts` trong folder route tương ứng, có `'use server'`
- Client components: có `'use client'`, dùng hooks
- Server components: mặc định, dùng `async/await` trực tiếp
- Dynamic routes cần data fresh: thêm `export const dynamic = 'force-dynamic'`
- TypeScript: không dùng `any` nếu tránh được; chạy `npx tsc --noEmit --skipLibCheck` để check

---

## 8. UI/UX Rules

- **Design tokens** (màu, font, spacing) từ `globals.css` — dùng class Tailwind như `text-rose`, `text-ink`, `text-muted`, `bg-cream`, `bg-paper`, `border-line`
- Font chữ: serif cho heading (`font-serif`), sans cho body
- Màu chính: `rose` (`#c2185b`)
- Spacing: `px-5 sm:px-6`, `py-10 pb-20`
- Responsive: mobile-first, breakpoint `lg:` cho desktop layout
- Không đụng vào `globals.css` hay `tailwind.config` trừ khi cần thiết

---

## 9. Deploy

```bash
# Từ thư mục web/
cd c:\Users\QuanLV17\Downloads\chococfko-web\web
vercel --prod --yes
```

- **Luôn deploy lên project `chococfko`** (có domain `chococfko.com`)
- Project `chococfko-web` là phụ — không cần quan tâm
- Vercel CLI đã link đúng project sau khi re-link trong session này
- Nếu bị hỏi "link to project?" → chọn `chococfko-s-projects/chococfko`
- Không cần commit git để deploy — Vercel CLI upload thẳng từ filesystem

---

## 10. Safety Rules (Bắt buộc)

- **Không đọc toàn bộ project** nếu không cần — chỉ mở file liên quan trực tiếp đến task
- **Không sửa migration cũ** — nếu cần thay đổi DB thì tạo migration mới
- **Không đụng `.env.local`** hoặc bất kỳ file chứa secret
- **Không đưa secret vào code** (API key, service role key, token, password)
- **Không làm hỏng** Cờ caro, Cờ tướng, Random Wheel, hay game khác khi sửa một game
- **Không sửa Supabase Realtime subscription** của game này khi làm task của game khác
- **Sau khi sửa:** báo rõ file nào đã sửa và logic thay đổi như thế nào

---

## 11. Vocabulary Display Rules

- Do **not** display language codes such as `VN`, `vn`, `VI`, `vi`, `GB`, `gb`, `EN`, `en`, `JP`, `jp`, `JA`, `ja` as prefixes before vocabulary meanings.
- `meanings[].vi` must display only the Vietnamese meaning text; `meanings[].en` must display only the English meaning text.
- Do **not** render text like `vn sửa chữa...`, `VN sửa chữa...`, `vi sửa chữa...`, `GB correction...`, or `EN correction...`.
- Do **not** use flag emoji (🇻🇳, 🇬🇧, etc.) as inline text prefixes before meaning text — on Windows these render as country-code text ("VN", "GB"), which breaks the display.
- If a language label is needed in the UI, use a **separate** UI label such as `Tiếng Việt` or `English`, never prepend it directly to the meaning text.
- Always call `cleanMeaningText()` from `@/lib/sanitize` when rendering vocabulary meanings — it strips any accidental language code prefixes from imported dictionary data.
- The final UI must look like:
  - `sửa chữa, hiệu chỉnh`
  - `correction, revision, to fix`
- NOT like:
  - `vn sửa chữa, hiệu chỉnh`
  - `GB correction, revision, to fix`
- Language codes are allowed only as internal metadata or keys, never as visible prefixes inside meaning text.

---

## 12. Known Pitfalls

### Cờ caro tournament
- `spinSnapshot` trong `RandomWheelClient.tsx` — freeze wheel entries trong lúc quay, **không xóa**
- Draw handling: SE → bỏ qua (rematch); Group stage → ghi nhận (match.group_id != null)
- `generateKnockout` tính standings in-memory từ group matches (round=0), sau đó tạo SE bracket tại round 1+
- `caro_tournament_leaderboard` là VIEW, không phải table — cần chạy `migration_caro_leaderboard.sql` trong Supabase SQL Editor trước khi dùng

### Random Wheel
- Pointer alignment dùng `POINTER_PCT = (CY - R) / W * 100 = 4.375` — percentage-based để khớp ở mọi kích thước
- **Không thay đổi rotation math** (`spin()` function) — công thức đã được calibrate

### Supabase
- Realtime channels: debounce 300ms + `mountedRef` guard để tránh memory leak
- RLS: mọi table cần RLS policy — kiểm tra kỹ khi tạo table mới

### i18n
- Missing key → hiển thị key thô trên UI (dễ bị bỏ sót khi thêm key chỉ cho 1 ngôn ngữ)
- Luôn update cả 5 file cùng lúc

---

## 13. Workflow Khi Làm Task Mới

1. **Đọc yêu cầu** — xác định route/file nào liên quan
2. **Chỉ đọc file liên quan** — không glob/read toàn bộ project
3. **Kiểm tra i18n** — nếu có text mới thì cập nhật cả 5 file
4. **Không thay đổi logic không liên quan** đến task
5. **Chạy TypeScript check:** `npx tsc --noEmit --skipLibCheck`
6. **Báo cáo:** file đã sửa + logic đã thay đổi
7. **Deploy khi được yêu cầu:** `vercel --prod --yes` từ `web/`

---

## 14. Environment Variables (Tên — không có giá trị)

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY       # Service role — server only, không expose client
ADMIN_EMAILS                    # Danh sách email admin, phân cách bằng dấu phẩy
NEXT_PUBLIC_SITE_URL            # https://chococfko.com (production)
LINE_CHANNEL_ID                 # LINE Login
LINE_CHANNEL_SECRET             # LINE Login secret
```

Giá trị thực nằm trong `.env.local` — không đọc, không sửa, không commit file này.
