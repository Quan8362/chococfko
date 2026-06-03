# Chợ Cóc FKO — Website cộng đồng Fukuoka

Cẩm nang địa điểm + cộng đồng chia sẻ chuyến đi của người Việt tại Fukuoka.
Xây bằng **Next.js 14 + TypeScript + Tailwind CSS**.

> Đây là **Giai đoạn 1**: giao diện hoàn chỉnh + trang chi tiết, chạy với dữ liệu mẫu
> (chưa có database / đăng nhập / đăng bài thật). Các giai đoạn sau sẽ thêm Supabase,
> đăng nhập, duyệt bài của admin, và 5 ngôn ngữ.

## Yêu cầu
- **Node.js 18.18 trở lên** (khuyên dùng 20+). Tải tại https://nodejs.org

## Chạy trên máy (local)
Mở Terminal/CMD trong thư mục dự án rồi gõ:

```bash
npm install      # cài thư viện (chạy 1 lần)
npm run dev      # chạy ở chế độ phát triển
```

Sau đó mở trình duyệt vào **http://localhost:3000**

> Cần có mạng để tải font (Google Fonts) và ảnh minh hoạ (LoremFlickr/Picsum).

## Các trang
| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang chủ — danh mục 77 địa điểm theo 9 chủ đề |
| `/dia-diem/<slug>` | Trang chi tiết từng địa điểm |
| `/cong-dong` | Danh sách bài viết cộng đồng |
| `/cong-dong/<id>` | Chi tiết một bài viết |
| `/cong-dong/viet-bai` | Form viết bài (mẫu, chưa lưu) |

## Cấu trúc thư mục
```
app/                 # các trang (App Router)
  page.tsx           # trang chủ
  dia-diem/[slug]/   # trang chi tiết địa điểm
  cong-dong/         # cộng đồng (list, [id], viet-bai)
  layout.tsx         # khung chung (nav + footer + font)
  globals.css        # màu sắc, hiệu ứng
components/           # Nav, Footer, PlaceCard, PostFeed, SmartImg
lib/
  places.ts          # dữ liệu 77 địa điểm (giai đoạn 1)
  posts.ts           # bài viết cộng đồng mẫu
public/logo.png      # logo Chợ Cóc FKO
```

## Sửa nội dung địa điểm
Mở `lib/places.ts` — mỗi địa điểm có tên, khu vực, mô tả, chủ đề, nhãn phí, link bản đồ.
(Sang giai đoạn 2 dữ liệu này sẽ chuyển vào database để admin sửa qua giao diện.)

## Lưu ý về ảnh
Ảnh hiện là **ảnh minh hoạ theo chủ đề** (tự động). Khi chạy thật sẽ thay bằng ảnh do
thành viên đăng hoặc ảnh chọn thủ công cho từng địa điểm.

## Các bước tiếp theo (đã lên kế hoạch)
2. Gắn **Supabase**: database địa điểm/bài viết + đăng ký/đăng nhập email
3. **Viết bài** thật + luồng **admin duyệt** + phân quyền (user không xoá, chỉ admin xoá)
4. Đăng nhập **Google / Facebook / LINE**
5. **5 ngôn ngữ**: Việt, Anh, Nhật, Hàn, Trung
6. Mua **domain chococfko.com** + deploy lên **Vercel**

## Deploy nhanh (khi sẵn sàng)
1. Đưa code lên GitHub
2. Vào vercel.com → Import dự án từ GitHub → Deploy (tự động)
3. Trong Vercel, thêm domain `chococfko.com` và làm theo hướng dẫn trỏ DNS
