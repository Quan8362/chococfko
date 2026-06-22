'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { setMyNotifPref } from '../actions';

export default function NotificationPreferences({
  types,
  initial,
}: {
  types: string[];
  initial: Record<string, boolean>;
}) {
  const t = useTranslations('notif_prefs');
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(type: string) {
    const next = !state[type];
    setState((s) => ({ ...s, [type]: next }));
    setSaving(type);
    const r = await setMyNotifPref(type, next);
    setSaving(null);
    if (!r.ok) setState((s) => ({ ...s, [type]: !next })); // revert on failure
  }

  return (
    <div className="max-w-[640px] mx-auto px-6 py-10">
      <Link href="/" className="text-[13px] text-muted hover:text-rose">← {t('back')}</Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mt-2 mb-1">{t('title')}</h1>
      <p className="text-[14px] text-muted mb-6">{t('sub')}</p>

      <ul className="space-y-2.5">
        {types.map((type) => (
          <li key={type} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-paper border border-line">
            <div className="min-w-0">
              <p className="font-semibold text-[14px] text-ink">{t(`type_${type}` as 'type_place_answer')}</p>
              <p className="text-[12.5px] text-muted">{t(`type_${type}_desc` as 'type_place_answer_desc')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state[type]}
              aria-label={t(`type_${type}` as 'type_place_answer')}
              disabled={saving === type}
              onClick={() => toggle(type)}
              className={`relative w-11 h-6 rounded-full flex-none transition-colors ${state[type] ? 'bg-rose' : 'bg-[#d8cabb]'} disabled:opacity-50`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${state[type] ? 'translate-x-5' : ''}`} />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted mt-5">{t('default_note')}</p>
    </div>
  );
}
