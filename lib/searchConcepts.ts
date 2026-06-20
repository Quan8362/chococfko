import { unstable_cache, revalidateTag } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { DEFAULT_SEARCH_CONFIG, buildConfigFromRows, type SearchConfig, type ConceptRow } from '@/lib/placeSearch';

// ============================================================
// Data-driven search concepts (IO/loader layer).
//
// Engine khớp (lib/placeSearch.ts) chạy trên 1 SearchConfig. Mặc định là
// DEFAULT_SEARCH_CONFIG (built-in). Module này NẠP THÊM khái niệm từ bảng
// `search_concepts` (Admin/DB) rồi merge (buildConfigFromRows) lên mặc định — cho
// phép thêm category / alias đa ngôn ngữ / feature facet MỚI mà KHÔNG cần sửa code.
//
// An toàn: thiếu bảng / lỗi / rỗng → trả DEFAULT (production vẫn chạy).
// Cache: unstable_cache(tag 'search-concepts', 5'); Admin gọi revalidateSearchConcepts().
//
// GIỚI HẠN (tài liệu hóa):
//   • Text thường, tên category, tag, alias đã cấu hình → tự động tìm được.
//   • FEATURE CLAIM (bbq/camping/nightlife/kayak…) vẫn cần BẰNG CHỨNG cấp item.
//   • Alias ngôn ngữ MỚI phải cấu hình qua bảng này (không dịch máy lúc search).
// ============================================================

export type { ConceptRow };
export { buildConfigFromRows };

/** Nạp config từ DB (cache 5'); fallback DEFAULT khi thiếu bảng / lỗi / rỗng. */
const loadCached = unstable_cache(
  async (): Promise<SearchConfig> => {
    try {
      const sb = createPublicClient();
      const { data, error } = await sb.from('search_concepts').select('*');
      if (error || !data?.length) return DEFAULT_SEARCH_CONFIG;
      return buildConfigFromRows(data as ConceptRow[]);
    } catch {
      return DEFAULT_SEARCH_CONFIG;
    }
  },
  ['search-concepts-v1'],
  { tags: ['search-concepts'], revalidate: 300 },
);

export async function loadSearchConfig(): Promise<SearchConfig> {
  return loadCached();
}

/** Gọi sau khi Admin sửa taxonomy để config mới có hiệu lực (trong ~5'). */
export function revalidateSearchConcepts(): void {
  revalidateTag('search-concepts');
}
