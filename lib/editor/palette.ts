// Shared, client-safe constants for the rich-text editor's text-color and
// highlight palettes. Kept deliberately small (no free-form color picker) so the
// output stays on-brand and the server sanitizer can stay tight.
//
// `key` is a stable i18n key under the editor namespace; `hex`/`rgb` are both the
// SAME color in the two serializations TipTap can emit (hex when first applied,
// rgb after the DOM round-trips it on reload) so active-state matching works
// regardless of which form is stored.

export interface PaletteColor {
  key: string
  hex: string
  rgb: string
}

// Text colors. `null` hex = "default / inherit" → unsetColor.
export const TEXT_COLORS: PaletteColor[] = [
  { key: 'color_ink', hex: '#241a17', rgb: 'rgb(36, 26, 23)' },
  { key: 'color_gray', hex: '#6b6b6b', rgb: 'rgb(107, 107, 107)' },
  { key: 'color_red', hex: '#d63a3a', rgb: 'rgb(214, 58, 58)' },
  { key: 'color_orange', hex: '#e8730c', rgb: 'rgb(232, 115, 12)' },
  { key: 'color_gold', hex: '#c79a1e', rgb: 'rgb(199, 154, 30)' },
  { key: 'color_green', hex: '#2f8f4e', rgb: 'rgb(47, 143, 78)' },
  { key: 'color_blue', hex: '#2563b8', rgb: 'rgb(37, 99, 184)' },
  { key: 'color_pink', hex: '#c2185b', rgb: 'rgb(194, 24, 91)' },
]

// Soft highlight backgrounds — kept light so dark text stays readable on top.
export const HIGHLIGHT_COLORS: PaletteColor[] = [
  { key: 'highlight_yellow', hex: '#fff3bf', rgb: 'rgb(255, 243, 191)' },
  { key: 'highlight_orange', hex: '#ffe0c2', rgb: 'rgb(255, 224, 194)' },
  { key: 'highlight_green', hex: '#d8f5dd', rgb: 'rgb(216, 245, 221)' },
  { key: 'highlight_blue', hex: '#d6eafe', rgb: 'rgb(214, 234, 254)' },
  { key: 'highlight_pink', hex: '#fde0ec', rgb: 'rgb(253, 224, 236)' },
  { key: 'highlight_gray', hex: '#ececec', rgb: 'rgb(236, 236, 236)' },
]

// True if the currently-applied color (which may be hex or rgb) matches a swatch.
export function colorMatches(current: string | null | undefined, c: PaletteColor): boolean {
  if (!current) return false
  const v = current.toLowerCase().replace(/\s+/g, '')
  return v === c.hex.toLowerCase() || v === c.rgb.toLowerCase().replace(/\s+/g, '')
}

// Callout block variants. Title is localized at insert time and stored on the
// node so it round-trips and renders identically on the public page.
export interface CalloutVariant {
  variant: string
  icon: string
  titleKey: string
}

export const CALLOUT_VARIANTS: CalloutVariant[] = [
  { variant: 'tip', icon: '💡', titleKey: 'callout_tip' },
  { variant: 'warning', icon: '⚠️', titleKey: 'callout_warning' },
  { variant: 'cost', icon: '💰', titleKey: 'callout_cost' },
  { variant: 'transit', icon: '🚃', titleKey: 'callout_transit' },
  { variant: 'highlight', icon: '⭐', titleKey: 'callout_highlight' },
]
