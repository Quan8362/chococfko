import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * One reusable header pattern for the homepage's secondary rails so every
 * section shares the same type scale, spacing and "see all →" affordance:
 *
 *   [optional icon] [serif title]            [optional action →]
 *                   [optional muted subtitle]
 *
 * The primary category sections (ExploreSearch) use a larger parallel variant;
 * these rails are intentionally one step down in the hierarchy.
 */
export default function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  className = 'mb-4',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: { href: string; label: ReactNode };
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-3 flex-wrap ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span aria-hidden className="flex-none grid place-items-center w-9 h-9 rounded-xl bg-rose/10 border border-rose/15 text-[18px] text-rose">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-serif font-bold text-[20px] sm:text-[24px] tracking-[-0.3px] leading-tight text-ink">{title}</h2>
          {subtitle && <p className="text-muted text-[13.5px] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex items-center gap-1 flex-none text-[13px] font-semibold text-rose hover:text-rose-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 rounded"
        >
          {action.label}
          <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}
