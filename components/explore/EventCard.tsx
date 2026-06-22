import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import type { PlaceEvent } from '@/lib/events';
import { isFree } from '@/lib/events';

// Self-contained event card. Shows JST date/time, venue/area, price, a verified
// official source link, and a registration link when present. Cancelled events
// are clearly labelled (never shown as if happening). Expired events should be
// filtered out before reaching here.

function fmtRange(startsAt: string, endsAt: string | null, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  };
  const start = new Date(startsAt);
  const s = new Intl.DateTimeFormat(locale, opts).format(start);
  if (!endsAt) return s;
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const e = new Intl.DateTimeFormat(locale, sameDay
    ? { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }
    : opts).format(end);
  return `${s} – ${e}`;
}

export default async function EventCard({ ev }: { ev: PlaceEvent }) {
  const [t, locale] = await Promise.all([getTranslations('events'), getLocale()]);
  const price = isFree(ev)
    ? t('free')
    : ev.priceMin != null
      ? `${ev.priceMin.toLocaleString()}${ev.priceMax && ev.priceMax !== ev.priceMin ? `–${ev.priceMax.toLocaleString()}` : ''} ${ev.currency ?? '¥'}`
      : null;

  return (
    <div className={`flex flex-col gap-2 p-4 rounded-2xl bg-paper border ${ev.isCancelled ? 'border-line opacity-70' : 'border-line'} relative`}>
      {ev.isCancelled && (
        <span className="absolute top-3 right-3 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fbe9ec] text-rose-deep">
          {t('cancelled')}
        </span>
      )}
      <div className="text-[12.5px] font-semibold text-rose-deep">{fmtRange(ev.startsAt, ev.endsAt, locale)} <span className="text-muted font-normal">{t('jst')}</span></div>
      <h3 className={`font-serif font-bold text-[16px] text-ink leading-snug ${ev.isCancelled ? 'line-through' : ''}`}>{ev.title}</h3>
      {(ev.venue || ev.area) && (
        <p className="text-[13px] text-muted">📍 {[ev.venue, ev.area].filter(Boolean).join(' · ')}</p>
      )}
      {ev.description && <p className="text-[13px] text-ink/80 leading-snug line-clamp-2">{ev.description}</p>}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {price && <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-cream border border-line text-ink">{price}</span>}
        {ev.placeSlug && <Link href={`/places/${ev.placeSlug}`} className="text-[12.5px] text-rose hover:text-rose-deep">{t('view_place')}</Link>}
        {ev.registrationUrl && !ev.isCancelled && (
          <a href={ev.registrationUrl} target="_blank" rel="noopener nofollow noreferrer" className="text-[12.5px] text-rose hover:text-rose-deep">{t('register')} ↗</a>
        )}
        {ev.sourceUrl && (
          <a href={ev.sourceUrl} target="_blank" rel="noopener nofollow noreferrer" className="text-[12px] text-muted hover:text-ink">{t('source')} ↗</a>
        )}
      </div>
      {ev.lastVerifiedAt && <p className="text-[11px] text-muted">{t('last_verified', { date: ev.lastVerifiedAt })}</p>}
    </div>
  );
}
