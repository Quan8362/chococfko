'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveEvent, type EventInput } from './actions';
import type { PlaceEvent } from '@/lib/events';

// Admin event editor. Times are entered/displayed in JST (Asia/Tokyo) and
// stored as UTC ISO. <input type="datetime-local"> has no timezone, so we
// append +09:00 on save and shift to JST wall-clock for display.

function isoToJstLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm in JST wall-clock
}
function jstLocalToIso(local: string): string | null {
  if (!local) return null;
  const withSec = local.length === 16 ? `${local}:00` : local;
  return new Date(`${withSec}+09:00`).toISOString();
}

const F = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className="w-full text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink" />
);

export default function EventForm({ initial }: { initial?: PlaceEvent }) {
  const t = useTranslations('events');
  const router = useRouter();
  const [s, setS] = useState({
    title: initial?.title ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    placeSlug: initial?.placeSlug ?? '',
    venue: initial?.venue ?? '',
    area: initial?.area ?? '',
    prefecture: initial?.prefecture ?? '',
    startsAt: isoToJstLocal(initial?.startsAt ?? null),
    endsAt: isoToJstLocal(initial?.endsAt ?? null),
    priceType: (initial?.priceType ?? '') as '' | 'free' | 'paid' | 'varies',
    priceMin: initial?.priceMin?.toString() ?? '',
    priceMax: initial?.priceMax?.toString() ?? '',
    currency: initial?.currency ?? 'JPY',
    sourceUrl: initial?.sourceUrl ?? '',
    registrationUrl: initial?.registrationUrl ?? '',
    lastVerifiedAt: initial?.lastVerifiedAt ?? '',
    status: (initial?.status ?? 'draft') as 'draft' | 'published',
    isCancelled: initial?.isCancelled ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = (patch: Partial<typeof s>) => setS((p) => ({ ...p, ...patch }));

  async function submit() {
    setErr(null);
    const startIso = jstLocalToIso(s.startsAt);
    if (!s.title.trim() || !startIso) { setErr(t('admin_required')); return; }
    setBusy(true);
    const input: EventInput = {
      id: initial?.id,
      title: s.title, slug: s.slug || null, description: s.description || null,
      placeSlug: s.placeSlug || null, venue: s.venue || null, area: s.area || null, prefecture: s.prefecture || null,
      startsAt: startIso, endsAt: jstLocalToIso(s.endsAt),
      priceType: s.priceType || null,
      priceMin: s.priceMin ? Number(s.priceMin) : null,
      priceMax: s.priceMax ? Number(s.priceMax) : null,
      currency: s.currency || null,
      sourceUrl: s.sourceUrl || null, registrationUrl: s.registrationUrl || null,
      lastVerifiedAt: s.lastVerifiedAt || null,
      status: s.status, isCancelled: s.isCancelled,
    };
    const r = await saveEvent(input);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? 'error'); return; }
    router.push('/admin/events');
    router.refresh();
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 space-y-3">
      <h2 className="font-serif font-bold text-[18px] text-ink">{initial ? t('admin_edit') : t('admin_new')}</h2>
      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_title')}<F value={s.title} onChange={(e) => up({ title: e.target.value })} /></label>
      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_description')}
        <textarea value={s.description} onChange={(e) => up({ description: e.target.value })} className="w-full text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink" rows={3} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_starts')}<F type="datetime-local" value={s.startsAt} onChange={(e) => up({ startsAt: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_ends')}<F type="datetime-local" value={s.endsAt} onChange={(e) => up({ endsAt: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_venue')}<F value={s.venue} onChange={(e) => up({ venue: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_area')}<F value={s.area} onChange={(e) => up({ area: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_prefecture')}<F value={s.prefecture} onChange={(e) => up({ prefecture: e.target.value })} placeholder="fukuoka" /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_place_slug')}<F value={s.placeSlug} onChange={(e) => up({ placeSlug: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_price_type')}
          <select value={s.priceType} onChange={(e) => up({ priceType: e.target.value as typeof s.priceType })} className="w-full text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink">
            <option value="">—</option><option value="free">{t('free')}</option><option value="paid">paid</option><option value="varies">varies</option>
          </select>
        </label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_currency')}<F value={s.currency} onChange={(e) => up({ currency: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_price_min')}<F type="number" value={s.priceMin} onChange={(e) => up({ priceMin: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_price_max')}<F type="number" value={s.priceMax} onChange={(e) => up({ priceMax: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_source')}<F value={s.sourceUrl} onChange={(e) => up({ sourceUrl: e.target.value })} placeholder="https://" /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_registration')}<F value={s.registrationUrl} onChange={(e) => up({ registrationUrl: e.target.value })} placeholder="https://" /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_last_verified')}<F type="date" value={s.lastVerifiedAt} onChange={(e) => up({ lastVerifiedAt: e.target.value })} /></label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">{t('f_slug')}<F value={s.slug} onChange={(e) => up({ slug: e.target.value })} placeholder="auto" /></label>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={s.status === 'published'} onChange={(e) => up({ status: e.target.checked ? 'published' : 'draft' })} />{t('f_published')}</label>
        <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={s.isCancelled} onChange={(e) => up({ isCancelled: e.target.checked })} />{t('cancelled')}</label>
      </div>
      {err && <p className="text-[13px] text-rose">{err}</p>}
      <button type="button" disabled={busy} onClick={submit} className="font-semibold text-[14px] px-5 py-2.5 rounded-full bg-rose text-white disabled:opacity-50">{busy ? '…' : t('admin_save')}</button>
    </div>
  );
}
