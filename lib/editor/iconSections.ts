// Section-heading icons the article editor can insert as a styled
// `iconHeading` block (icon badge + bold label). Labels are i18n keys under the
// `post_form` namespace so the menu — and the inserted text — follow the
// writer's language. Single source of truth; never inline this list in JSX.

export interface IconSectionItem {
  icon: string
  /** i18n key under `post_form` for the dropdown label. */
  key: string
  /**
   * Optional i18n key for the text actually inserted, when it should differ from
   * the (shorter) dropdown label — e.g. label "Phù hợp sau giờ làm / đi chơi"
   * but inserts the full "Phù hợp để ghé sau giờ làm hoặc sau khi đi chơi".
   */
  insertKey?: string
}

export interface IconSectionGroup {
  /** i18n key under `post_form` for the group heading. */
  categoryKey: string
  items: IconSectionItem[]
}

export const ARTICLE_ICON_SECTIONS: IconSectionGroup[] = [
  {
    categoryKey: 'isec_cat_travel',
    items: [
      { icon: '📍', key: 'isec_location' },
      { icon: '🗺️', key: 'isec_map' },
      { icon: '🚆', key: 'isec_access' },
      { icon: '🚌', key: 'isec_bus' },
      { icon: '🚗', key: 'isec_parking' },
      { icon: '🚶', key: 'isec_walk' },
      { icon: '🎫', key: 'isec_ticket' },
      { icon: '🆓', key: 'isec_free' },
    ],
  },
  {
    categoryKey: 'isec_cat_experience',
    items: [
      { icon: '✨', key: 'isec_first_impression' },
      { icon: '🌙', key: 'isec_night' },
      { icon: '☀️', key: 'isec_day' },
      { icon: '📸', key: 'isec_photo_spot' },
      { icon: '⭐', key: 'isec_highlight' },
      { icon: '❤️', key: 'isec_personal' },
      { icon: '📝', key: 'isec_advice' },
      { icon: '✅', key: 'isec_should_try' },
      { icon: '⚠️', key: 'isec_note' },
      { icon: '💡', key: 'isec_tip' },
    ],
  },
  {
    categoryKey: 'isec_cat_food',
    items: [
      { icon: '🍜', key: 'isec_food' },
      { icon: '🍣', key: 'isec_signature' },
      { icon: '🍻', key: 'isec_drink' },
      { icon: '☕', key: 'isec_cafe' },
      { icon: '💰', key: 'isec_cost' },
      { icon: '🧾', key: 'isec_menu' },
      { icon: '🕒', key: 'isec_hours' },
      { icon: '📞', key: 'isec_booking' },
    ],
  },
  {
    categoryKey: 'isec_cat_nature',
    items: [
      { icon: '🌿', key: 'isec_nature' },
      { icon: '🏔️', key: 'isec_mountain' },
      { icon: '🏕️', key: 'isec_camping' },
      { icon: '♨️', key: 'isec_onsen' },
      { icon: '🌊', key: 'isec_sea' },
      { icon: '🌸', key: 'isec_best_season' },
      { icon: '☔', key: 'isec_weather' },
    ],
  },
  {
    categoryKey: 'isec_cat_convenience',
    items: [
      { icon: '👨‍👩‍👧', key: 'isec_family' },
      { icon: '🐶', key: 'isec_pet' },
      { icon: '🚻', key: 'isec_toilet' },
      { icon: '🛒', key: 'isec_shop_nearby' },
      { icon: '📶', key: 'isec_wifi' },
      { icon: '👥', key: 'isec_crowd' },
      { icon: '🔒', key: 'isec_safety' },
    ],
  },
  {
    categoryKey: 'isec_cat_recommendation',
    items: [
      // 🎯 = recommended target/fit (NOT ⭐, which is reserved for "Điểm nổi bật").
      { icon: '🎯', key: 'isec_suitable_after_work', insertKey: 'isec_suitable_after_work_full' },
      { icon: '🎯', key: 'isec_suitable_for_who' },
    ],
  },
  {
    categoryKey: 'isec_cat_article_structure',
    items: [
      { icon: '📌', key: 'isec_conclusion' },
    ],
  },
]
