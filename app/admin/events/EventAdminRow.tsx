'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { PlaceEvent } from '@/lib/events';
import { deleteEvent, setEventStatus, toggleEventCancelled } from './actions';

export default function EventAdminRow({ ev }: { ev: PlaceEvent }) {
  const t = useTranslations('events');
  const router = useRouter();
  const after = (p: Promise<unknown>) => p.then(() => router.refresh());

  return (
    <li className="flex items-center justify-between gap-3 p-3 rounded-xl bg-paper border border-line">
      <div className="min-w-0">
        <p className="font-semibold text-[14px] text-ink truncate">{ev.title}</p>
        <p className="text-[12px] text-muted">
          {new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ev.startsAt))} JST
          {' · '}{ev.status}{ev.isCancelled ? ` · ${t('cancelled')}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-none">
        <Link href={`/admin/events?edit=${ev.id}`} className="text-[12.5px] text-rose hover:text-rose-deep">{t('admin_edit')}</Link>
        <button type="button" onClick={() => after(setEventStatus(ev.id, ev.status === 'published' ? 'draft' : 'published'))} className="text-[12.5px] text-ink hover:text-rose">
          {ev.status === 'published' ? t('admin_unpublish') : t('admin_publish')}
        </button>
        <button type="button" onClick={() => after(toggleEventCancelled(ev.id, !ev.isCancelled))} className="text-[12.5px] text-ink hover:text-rose">
          {ev.isCancelled ? t('admin_uncancel') : t('admin_cancel')}
        </button>
        <button type="button" onClick={() => { if (confirm(t('admin_delete_confirm'))) after(deleteEvent(ev.id)); }} className="text-[12.5px] text-rose hover:text-rose-deep">
          {t('admin_delete')}
        </button>
      </div>
    </li>
  );
}
