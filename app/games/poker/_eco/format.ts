// Locale-aware display helpers for the poker ecosystem screens. Display ONLY — every coin value
// is an authoritative integer from the server; these never participate in any coin math.

export function coins(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(n))
}

export function signedCoins(n: number, locale: string): string {
  const s = new Intl.NumberFormat(locale, { signDisplay: 'always' }).format(Math.round(n))
  return s
}

export function dateTime(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

export function dateShort(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(ms))
}
