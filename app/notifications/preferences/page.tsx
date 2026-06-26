import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getMyNotifPrefs } from '../actions';
import { CONFIGURABLE_TYPES, effectiveEnabled } from '@/lib/notifications/prefs';
import NotificationPreferences from './NotificationPreferences';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('notif_prefs');
  return { title: `${t('title')}` };
}

export default async function NotificationPrefsPage() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect('/login?next=/notifications/preferences');

  const explicit = await getMyNotifPrefs();
  const initial: Record<string, boolean> = {};
  for (const type of CONFIGURABLE_TYPES) initial[type] = effectiveEnabled(type, explicit[type]);

  return <NotificationPreferences types={[...CONFIGURABLE_TYPES]} initial={initial} />;
}
