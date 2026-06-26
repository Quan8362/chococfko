// Client-safe area key mapping — split out of lib/places.ts so Client
// Components (e.g. app/map/MapExplorerV2.tsx) can use it without pulling the
// server-only data layer (lib/supabase/server.ts → next/headers) into the
// client bundle graph.
//
// Map các chuỗi "area" tiếng Việt cũ (free text) sang i18n key tương ứng.
// Dùng cho địa điểm legacy chưa có trường có cấu trúc.
export const AREA_LEGACY_KEY_MAP: Record<string, string> = {
  'Tối': 'area_toi', 'Sáng': 'area_sang', 'Trưa': 'area_trua',
  'Chiều': 'area_chieu', 'Trưa / Tối': 'area_trua_toi',
  'Gần Ohori': 'area_near_ohori', 'Gần Fukuoka Tower': 'area_near_fukuoka_tower',
  'Dễ · hợp người mới': 'area_mountain_easy_beginner',
  'Dễ–TB · gần thành phố': 'area_mountain_easymid_city',
  'Dễ–TB': 'area_mountain_easymid',
  'Trung bình · rất nổi tiếng': 'area_mountain_mid_popular',
  'Trung bình · thiên nhiên đẹp': 'area_mountain_mid_nature',
  'Trung bình · mùa lá đỏ': 'area_mountain_mid_autumn',
  'Trung bình · view biển': 'area_mountain_mid_seaview',
  'Có cáp treo · ngắm đêm': 'area_mountain_cable_night',
  'Umi-machi · gần Dazaifu': 'area_umi_near_dazaifu',
  'Đảo Nokonoshima': 'area_nokonoshima_island',
};
