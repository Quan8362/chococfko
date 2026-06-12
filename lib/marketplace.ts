// Chợ đồ cũ (used-goods marketplace) — pure types, constants and helpers.
// NO server-only imports here so this module is safe to import from client
// components. Data-fetching helpers live in `@/lib/marketplace-data`.

export type ListingType = 'sell' | 'free'
export type ListingCondition = 'new' | 'used'
export type ListingStatus = 'pending' | 'approved' | 'rejected'
export type SaleStatus = 'available' | 'reserved' | 'sold'

export interface Listing {
  id: string
  user_id: string
  title: string
  description: string | null
  listing_type: ListingType
  price: number | null
  is_negotiable: boolean
  condition: ListingCondition
  condition_percent: number | null
  category: string
  area: string | null
  images: string[]
  cover_image: string | null
  status: ListingStatus
  sale_status: SaleStatus
  view_count: number
  created_at: string
  updated_at: string | null
  sold_at: string | null
}

export interface ListingComment {
  id: string
  listing_id: string
  user_id: string
  content: string
  created_at: string
  author_name: string | null
  author_avatar: string | null
}

// Category keys → i18n `marketplace.cat_<key>`
export const CATEGORIES = [
  'electronics',
  'appliances',
  'furniture',
  'fashion',
  'mom_baby',
  'books',
  'vehicle',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

// Condition presets. 'new' = 100%. Used buckets map to a percent.
// i18n key: `marketplace.cond_<key>`
export const CONDITION_PRESETS = [
  { key: 'like_new', percent: 95 },
  { key: 'good', percent: 80 },
  { key: 'fair', percent: 60 },
  { key: 'worn', percent: 40 },
] as const

export const SORTS = ['newest', 'price_asc', 'price_desc'] as const
export type SortKey = (typeof SORTS)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(id: string) {
  return UUID_RE.test(id)
}

export function formatPriceJPY(price: number | null): string {
  if (price == null) return ''
  return '¥' + price.toLocaleString('ja-JP')
}

export function relativeListingDate(iso: string, locale = 'vi'): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (secs < 60) return rtf.format(-secs, 'second')
  if (secs < 3600) return rtf.format(-Math.floor(secs / 60), 'minute')
  if (secs < 86400) return rtf.format(-Math.floor(secs / 3600), 'hour')
  if (secs < 2592000) return rtf.format(-Math.floor(secs / 86400), 'day')
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export type ListingFilters = {
  q?: string
  category?: string
  type?: ListingType
  condition?: ListingCondition
  sort?: SortKey
}
