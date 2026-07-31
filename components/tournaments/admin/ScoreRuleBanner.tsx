'use client'

import { useTranslations } from 'next-intl'
import type { EventScoringRuleView, HandicapRuleView, StageRuleView } from '@/lib/tournaments/rules'

// Compact, read-only display of the rule a score editor is scoring under (Prompt 15D-1). Shows the
// target / margin / cap / games-to-win for the match's stage, a "system default" label for legacy
// events (no snapshot), a blocker notice when an enabled handicap is not yet configured, and — for the
// OFFICIAL FJP handicap (Prompt 15D-1B) — a "configured" note describing the head start.
// Purely presentational: the SERVER remains the authority for every decision.
export default function ScoreRuleBanner({
  rule,
  source,
  handicapBlocked,
  handicap,
}: {
  rule: StageRuleView | null | undefined
  source: EventScoringRuleView['source'] | undefined
  handicapBlocked: boolean
  handicap?: HandicapRuleView | null
}) {
  const t = useTranslations('admin_match_scores')

  // A configured difference-handicap (values confirmed) shows its head-start rule rather than blocking.
  const showConfigured =
    !handicapBlocked &&
    !!handicap &&
    handicap.enabled &&
    handicap.mode === 'female_count_difference' &&
    typeof handicap.pointsPerDifference === 'number'

  const parts = rule
    ? [
        t('rule_points', { n: rule.pointsToWin }),
        t('rule_winby', { n: rule.winBy }),
        rule.pointsCap != null ? t('rule_cap', { n: rule.pointsCap }) : null,
        t('rule_games', { win: rule.gamesToWin, max: rule.maxGames }),
      ].filter((x): x is string => !!x)
    : []

  return (
    <>
      <div className="mb-3 rounded-lg bg-cream border border-line px-3 py-2">
        <p className="text-[11px] text-muted mb-0.5">{t('rule_label')}</p>
        {rule && source !== 'legacy_default' ? (
          <p className="text-[12.5px] text-ink">{parts.join(' · ')}</p>
        ) : (
          <p className="text-[12.5px] text-ink">{t('rule_legacy')}</p>
        )}
      </div>
      {handicapBlocked && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5" role="alert">
          <p className="text-[13px] text-amber-700">{t('handicap_blocked')}</p>
        </div>
      )}
      {showConfigured && (
        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <p className="text-[12.5px] text-emerald-700">
            {t('handicap_configured', { n: handicap!.pointsPerDifference as number })}
          </p>
        </div>
      )}
    </>
  )
}
