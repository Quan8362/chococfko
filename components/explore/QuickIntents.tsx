'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PRIMARY_INTENTS, SECONDARY_INTENTS, intentHref, type DiscoveryShortcut } from '@/lib/discoveryShortcuts';
import { trackEvent } from '@/lib/analytics';

// Layer 3 — quick practical needs. Situational shortcuts only (no categories).
// Prominent, tinted pills; 6 primary visible + the rest behind an accessible
// "Show more" disclosure. Each chip deep-links into /places with real structured
// filters. Analytics use stable keys (never translated labels).

function IntentChip({ s, label }: { s: DiscoveryShortcut; label: string }) {
  return (
    <Link
      href={intentHref(s)}
      onClick={() => void trackEvent('explore_intent_selected', { path: '/', metadata: { intent: s.analyticsKey } })}
      className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-full text-[14px] font-semibold bg-rose-soft/70 border border-rose/25 text-rose-deep hover:bg-rose hover:text-white hover:border-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 transition-colors"
    >
      <span aria-hidden className="text-[15px] leading-none">{s.emoji}</span>
      {label}
    </Link>
  );
}

export default function QuickIntents() {
  const t = useTranslations('explore_home');
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="quick-needs-heading" className="max-w-[1240px] mx-auto px-6 mt-5">
      <h3 id="quick-needs-heading" className="text-[13px] font-bold uppercase tracking-[1px] text-rose-deep/80 mb-2.5">
        {t('quick_needs_heading')}
      </h3>
      <div className="flex flex-wrap gap-2.5">
        {PRIMARY_INTENTS.map((s) => <IntentChip key={s.id} s={s} label={t(s.labelKey as 'intent_near_me')} />)}

        {SECONDARY_INTENTS.length > 0 && (
          <span id="quick-needs-secondary" className={open ? 'contents' : 'hidden'}>
            {SECONDARY_INTENTS.map((s) => <IntentChip key={s.id} s={s} label={t(s.labelKey as 'intent_near_me')} />)}
          </span>
        )}

        {SECONDARY_INTENTS.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="quick-needs-secondary"
            aria-label={t('quick_needs_more_aria')}
            onClick={() => {
              setOpen((o) => {
                if (!o) void trackEvent('explore_intent_expanded', { path: '/' });
                return !o;
              });
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-full text-[13.5px] font-medium bg-paper border border-dashed border-line text-muted hover:border-rose hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 transition-colors"
          >
            {open ? t('show_less') : t('show_more')}
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
