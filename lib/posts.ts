export interface Post {
  id: string;
  title: string;
  category: string; // landmark | food | sea | camp | mountain | park | viet
  categoryLabel: string;
  area: string;
  rating: number; // 1..5
  author: string;
  authorId?: string;
  authorInitial: string;
  authorColor: string;
  authorAvatar?: string;
  date: string;
  excerpt: string;
  body: string[];
  img: string;
  imgFallback: string;
  big?: boolean;
  mapUrl?: string;
  fee?: string;
  postType?: string;
  createdAt?: string; // raw ISO timestamp for SEO/JSON-LD; `date` is the localized relative string
  placeSlug?: string | null; // place this post is about (places.slug), if any
}

function lf(tags: string, n: number) {
  return `https://loremflickr.com/1000/750/${tags}?lock=${n}`;
}
function ps(n: number) {
  return `https://picsum.photos/seed/cd${n}/1000/750`;
}

export const posts: Post[] = [
  {
    id: "yatai-nakasu",
    title: "Một tối lang thang yatai Nakasu",
    category: "food",
    categoryLabel: "Ăn uống",
    area: "Nakasu · Hakata",
    rating: 5,
    author: "Trang",
    authorInitial: "T",
    authorColor: "#c81e5b,#c8881f",
    date: "3 ngày trước",
    excerpt:
      "Ngồi quầy ven sông, gọi tô ramen Hakata nóng hổi với ly bia mát lạnh, nghe chủ quán kể chuyện.",
    body: [
      "Tối thứ Sáu, cả nhóm hẹn nhau ở Nakasu. Hàng yatai (quầy ăn di động) bắt đầu sáng đèn dọc bờ sông, khói nghi ngút và mùi nước dùng thơm lừng.",
      "Bọn mình gọi ramen Hakata, vài xiên yakitori và bia. Chủ quán vui tính, nói được vài câu tiếng Anh, chỉ cho cách ăn đúng kiểu. Không gian chật mà ấm cúng, ngồi sát người lạ rồi thành quen.",
      "Mẹo nhỏ: đi sớm tầm 7-8h tối để có chỗ, mang theo tiền mặt vì nhiều quầy không nhận thẻ.",
    ],
    img: lf("yatai,ramen,night,japan", 2001),
    imgFallback: ps(2001),
    big: true,
  },
  {
    id: "cafe-bien-itoshima",
    title: "Cafe biển Itoshima một ngày nắng đẹp",
    category: "sea",
    categoryLabel: "Biển",
    area: "Itoshima",
    rating: 5,
    author: "Nam",
    authorInitial: "N",
    authorColor: "#1f8fa6,#5fbecf",
    date: "4 ngày trước",
    excerpt: "Lái xe dọc bờ biển, dừng ở quán cafe nhìn ra Genkai, gió mát rượi.",
    body: [
      "Itoshima cuối tuần đông nhưng vẫn rất chill. Bọn mình thuê xe lái dọc bờ biển, ghé một quán cafe có ghế ngồi nhìn thẳng ra biển.",
      "Nắng đẹp, gió mát, cà phê ngon. Ngồi cả buổi chiều chẳng muốn về. Gần đó có cổng torii trắng nổi tiếng để chụp ảnh.",
    ],
    img: lf("beach,cafe,sea,japan", 2002),
    imgFallback: ps(2002),
  },
  {
    id: "pho-tre-xanh",
    title: "Tô phở chuẩn vị nhà ở Tre Xanh",
    category: "viet",
    categoryLabel: "Quán Việt",
    area: "Hakata",
    rating: 5,
    author: "Mai",
    authorInitial: "M",
    authorColor: "#c81e5b,#9d1248",
    date: "1 tuần trước",
    excerpt:
      "Đang nhớ nhà mà ghé Tre Xanh là đỡ hẳn. Nước dùng thơm, bánh phở mềm, có cả rau quế.",
    body: [
      "Làm việc xa nhà, thỉnh thoảng thèm một tô phở đúng vị. Tre Xanh gần Hakata là lựa chọn quen của mình.",
      "Nước dùng đậm đà, bánh phở mềm, rau ăn kèm đầy đủ. Giá hợp lý, phục vụ thân thiện. Cuối tuần hơi đông nên nên đi sớm.",
    ],
    img: lf("pho,vietnamese,food", 2003),
    imgFallback: ps(2003),
  },
  {
    id: "binh-minh-homan",
    title: "Đón bình minh trên đỉnh Homan-zan",
    category: "mountain",
    categoryLabel: "Leo núi",
    area: "Dazaifu",
    rating: 4,
    author: "Đức",
    authorInitial: "Đ",
    authorColor: "#c8881f,#b0762a",
    date: "2 tuần trước",
    excerpt:
      "Dậy từ 4h sáng leo lên, mệt nhưng cảnh trên đỉnh xứng đáng từng bước.",
    body: [
      "Homan-zan là ngọn núi nổi tiếng vùng Dazaifu. Bọn mình dậy sớm leo để kịp bình minh.",
      "Đường khá dốc, nhiều bậc đá. Lên tới đỉnh thì cảnh đẹp ngỡ ngàng, mây phủ dưới chân. Nhớ mang giày tốt, đủ nước và một chiếc áo khoác.",
    ],
    img: lf("mountain,sunrise,hiking", 2004),
    imgFallback: ps(2004),
  },
  {
    id: "hoa-nokonoshima",
    title: "Mùa hoa rực rỡ ở đảo Nokonoshima",
    category: "park",
    categoryLabel: "Công viên",
    area: "Đảo Nokonoshima",
    rating: 5,
    author: "Hà",
    authorInitial: "H",
    authorColor: "#1f8fa6,#2bb38e",
    date: "4 ngày trước",
    excerpt:
      "Đi phà 10 phút là tới đảo, cả vườn hoa nở rộ nhìn ra biển. Mang theo bữa trưa ngồi picnic là chuẩn bài.",
    body: [
      "Từ bến phà Meinohama đi khoảng 10 phút là tới đảo Nokonoshima. Lên đảo có xe bus nhỏ đưa tới công viên hoa.",
      "Mùa nào hoa nấy, view nhìn ra biển rất đẹp. Bọn mình mang theo đồ ăn ngồi picnic cả buổi. Rất hợp đi gia đình.",
    ],
    img: lf("flowers,garden,island", 2005),
    imgFallback: ps(2005),
  },
  {
    id: "cam-trai-yame",
    title: "Cắm trại ngắm sao ở Hoshino, Yame",
    category: "camp",
    categoryLabel: "Camping",
    area: "Yame",
    rating: 4,
    author: "Quân",
    authorInitial: "Q",
    authorColor: "#7cbf52,#4f9a3e",
    date: "5 ngày trước",
    excerpt:
      "Trời quang, sao dày đặc, cả nhóm nướng BBQ tới khuya. Hơi xa thành phố nhưng đáng để đi một chuyến.",
    body: [
      "Yame cách trung tâm khá xa nhưng bù lại trời rất trong. Đêm xuống, sao nhiều không đếm xuể.",
      "Bọn mình dựng lều, nướng BBQ, trò chuyện tới khuya. Nên đặt chỗ trước và kiểm tra quy định dùng lửa.",
    ],
    img: lf("camping,stars,bbq,night", 2006),
    imgFallback: ps(2006),
  },
];

export function getPost(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}

// ── Supabase helpers ─────────────────────────────────────────

interface DbPost {
  id: string;
  user_id: string;
  title: string;
  category: string;
  category_label: string;
  area: string;
  rating: number;
  excerpt: string | null;
  body: string[] | null;
  img: string | null;
  img_fallback: string | null;
  status: string;
  post_type?: string | null;
  created_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
  map_url?: string | null;
  fee?: string | null;
  place_slug?: string | null;
}

const AUTHOR_COLORS = [
  '#c81e5b,#c8881f',
  '#1f8fa6,#5fbecf',
  '#c8881f,#b0762a',
  '#7cbf52,#4f9a3e',
  '#9b59b6,#8e44ad',
  '#1f8fa6,#2bb38e',
];

function relativeDate(iso: string, locale = 'vi'): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff === 0) return rtf.format(0, 'day');
  if (diff < 7) return rtf.format(-diff, 'day');
  if (diff < 30) return rtf.format(-Math.floor(diff / 7), 'week');
  return rtf.format(-Math.floor(diff / 30), 'month');
}

function mapDbPost(row: DbPost, index: number, locale = 'vi'): Post {
  const name = row.author_name || 'Thành viên';
  const colorIdx = row.user_id.charCodeAt(0) % AUTHOR_COLORS.length;
  const seed = row.id.replace(/-/g, '').slice(0, 8);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    categoryLabel: row.category_label,
    area: row.area,
    rating: row.rating,
    author: name,
    authorId: row.user_id,
    authorInitial: name[0].toUpperCase(),
    authorColor: AUTHOR_COLORS[colorIdx],
    authorAvatar: row.author_avatar || undefined,
    date: relativeDate(row.created_at, locale),
    excerpt: row.excerpt || '',
    body: row.body || [],
    img: row.img || `https://loremflickr.com/1000/750/${row.category},japan?lock=${seed}`,
    imgFallback: row.img_fallback || `https://picsum.photos/seed/${seed}/1000/750`,
    big: index === 0,
    mapUrl: row.map_url || undefined,
    fee: row.fee || undefined,
    postType: row.post_type || undefined,
    createdAt: row.created_at || undefined,
    placeSlug: row.place_slug ?? null,
  };
}

/**
 * Approved community posts written about a specific place (by places.slug).
 *
 * Resilient by design: if the `place_slug` column does not exist yet (migration
 * not applied) or any query error occurs, returns [] so the place page simply
 * shows its empty state instead of crashing.
 */
export async function getPostsForPlace(placeSlug: string, locale = 'vi', limit = 6): Promise<Post[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !placeSlug) return [];
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    // Query the base `posts` table (not the `posts_with_author` view): the view
    // is defined as `select p.*`, whose column list is frozen at creation time,
    // so it does NOT expose the later-added `place_slug` column. The base table
    // has it. PlacePostCard doesn't render the author, so the join isn't needed.
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('place_slug', placeSlug)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as DbPost[]).map((row, i) => mapDbPost(row, i, locale));
  } catch {
    return [];
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(id: string) { return UUID_RE.test(id); }

function getAppLocale(): string {
  try {
    const { cookies } = require('next/headers');
    return cookies().get('locale')?.value ?? 'vi';
  } catch {
    return 'vi';
  }
}

export async function getPostsFromDb(): Promise<Post[] | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const locale = getAppLocale();
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    // Community feed = community articles only. Legacy/place posts
    // (post_type null or 'place') must NOT appear here.
    const { data, error } = await supabase
      .from('posts_with_author')
      .select('*')
      .eq('status', 'approved')
      .eq('post_type', 'community')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error || !data?.length) return null;
    return (data as DbPost[]).map((row, i) => mapDbPost(row, i, locale));
  } catch {
    return null;
  }
}

export async function getPlacePostsFromDb(): Promise<Post[] | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const locale = getAppLocale();
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('posts_with_author')
      .select('*')
      .eq('status', 'approved')
      .eq('post_type', 'place')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data?.length) return null;
    return (data as DbPost[]).map((row, i) => mapDbPost(row, i, locale));
  } catch {
    return null;
  }
}

export interface PostRating {
  average: number;
  count: number;
  myStars: number | null;
  myReview: string | null;
}

export async function getPostRating(postId: string, viewerId?: string | null): Promise<PostRating> {
  const empty: PostRating = { average: 0, count: 0, myStars: null, myReview: null };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(postId)) return empty;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin
      .from('post_ratings')
      .select('stars, review, user_id')
      .eq('post_id', postId);
    const rows = (data ?? []) as { stars: number; review: string | null; user_id: string }[];
    const count = rows.length;
    const average = count ? rows.reduce((s, r) => s + r.stars, 0) / count : 0;
    const mine = viewerId ? rows.find((r) => r.user_id === viewerId) : undefined;
    return { average, count, myStars: mine?.stars ?? null, myReview: mine?.review ?? null };
  } catch {
    return empty;
  }
}

export async function getPostFromDb(id: string): Promise<Post | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !isUuid(id)) return null;
  try {
    const locale = getAppLocale();
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('posts_with_author')
      .select('*')
      .eq('id', id)
      .eq('status', 'approved')
      .single();
    if (error || !data) return null;
    return mapDbPost(data as DbPost, 0, locale);
  } catch {
    return null;
  }
}
