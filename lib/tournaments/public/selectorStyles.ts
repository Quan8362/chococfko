// Class-name builders for the public tournament event selector and the tab strip.
//
// These live in a pure module (no React) for one reason: the active/inactive states MUST differ only
// in paint-level properties (colour, background, shadow) and never in anything that changes a button's
// outer box — border WIDTH, padding, height, font metrics. If the box changed with selection, moving
// the highlight would reflow its neighbours and shift the layout sideways. selectorStyles.test.ts
// pins that invariant so a future style tweak can't silently reintroduce the jump.

// ── Event selector ────────────────────────────────────────────────────────────────────────────────
// Both states carry a real 1px border (active recolours it, inactive keeps the line colour) so the
// border never adds width on selection. Font weight is identical in both states → no text reflow.
export const EVENT_BTN_BASE =
  'flex-none inline-flex items-center box-border min-h-[40px] max-w-[240px] truncate whitespace-nowrap text-[13px] font-medium px-3.5 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40'
export const EVENT_BTN_ACTIVE = 'border-rose bg-rose text-white shadow-card'
export const EVENT_BTN_INACTIVE = 'border-line bg-paper text-ink hover:border-rose/40 hover:bg-rose-soft/30'

export function eventButtonClass(active: boolean): string {
  return `${EVENT_BTN_BASE} ${active ? EVENT_BTN_ACTIVE : EVENT_BTN_INACTIVE}`
}

// ── Tab strip ─────────────────────────────────────────────────────────────────────────────────────
// The active tab is bold and inactive is semibold — different glyph widths. To stop the bold weight
// from widening the active tab and pushing the tabs after it, the label is rendered over an always-
// bold invisible ghost (see TournamentDetail) so every tab reserves its bold width in both states.
// These class sets therefore keep identical box geometry (border-width, padding, height); only colour
// and weight change.
export const TAB_BASE =
  'flex-none inline-flex items-center box-border min-h-[44px] whitespace-nowrap text-[13.5px] px-3.5 -mb-px border-b-2 rounded-t transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40'
export const TAB_ACTIVE = 'border-rose text-rose font-bold'
// Inactive tabs read at text-ink/70 (darker than the old muted grey) for a clearer, more confident
// resting state that still sits well below the bold rose active tab — see design §7.
export const TAB_INACTIVE = 'border-transparent text-ink/70 font-semibold hover:text-ink hover:border-line'

export function tabButtonClass(active: boolean): string {
  return `${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`
}

// ── Header action buttons (Rules · Share · Refresh) ─────────────────────────────────────────────────
// One shared box so the three header actions line up on identical height, radius, icon size and spacing
// (design §3). Only paint differs: NEUTRAL = Share/Refresh (secondary), ACCENT = Rules (soft cyan brand
// treatment). Keeping a real 1px border on both — transparent on the accent — means the two variants
// share the exact same outer box, so the row never jitters between them.
export const ACTION_BTN_BASE =
  'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12.5px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40'
export const ACTION_BTN_NEUTRAL = 'text-ink bg-paper border-line hover:border-rose/40 hover:text-rose'
export const ACTION_BTN_ACCENT = 'text-teal bg-teal-soft border-transparent hover:bg-teal-soft/70'

export function actionButtonClass(accent = false): string {
  return `${ACTION_BTN_BASE} ${accent ? ACTION_BTN_ACCENT : ACTION_BTN_NEUTRAL}`
}
