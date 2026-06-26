import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { checkIsAdmin } from '@/lib/supabase/admin';
import { getAllEventsAdmin } from '@/lib/eventsDb';
import EventForm from './EventForm';
import EventAdminRow from './EventAdminRow';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'Admin · Events' };
}

export default async function AdminEventsPage({ searchParams }: { searchParams: { edit?: string } }) {
  if (!(await checkIsAdmin())) redirect('/');
  const t = await getTranslations('events');
  const events = await getAllEventsAdmin();
  const editing = searchParams.edit ? events.find((e) => e.id === searchParams.edit) : undefined;

  return (
    <div className="max-w-[820px] mx-auto px-6 py-10">
      <Link href="/admin" className="text-[13px] text-muted hover:text-rose">← Admin</Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mt-2 mb-2">{t('admin_title')}</h1>
      <p className="text-[13px] text-muted mb-6">{t('admin_sub')}</p>

      <div className="mb-8">
        <EventForm key={editing?.id ?? 'new'} initial={editing} />
        {editing && <Link href="/admin/events" className="inline-block text-[13px] text-muted hover:text-rose mt-3">{t('admin_new')} +</Link>}
      </div>

      <h2 className="font-semibold text-[15px] text-ink mb-3">{t('admin_all')} ({events.length})</h2>
      {events.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('admin_empty')}</p>
      ) : (
        <ul className="space-y-2">{events.map((ev) => <EventAdminRow key={ev.id} ev={ev} />)}</ul>
      )}
    </div>
  );
}
